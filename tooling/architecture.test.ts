import { describe, test, expect } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect, affectedPackages, type Policy } from "./architecture";
function fixture(a: string, b = "", dependencies: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "loop-architecture-"));
  const policy: Policy = {
    version: 1,
    exceptionLimit: 0,
    exceptions: [],
    layers: {
      contracts: [],
      domain: ["contracts"],
      application: ["contracts", "domain"],
      composition: ["contracts", "domain", "application"],
    },
    packages: {
      "@fixture/a": {
        path: "packages/a",
        owner: "test",
        role: "domain",
        allows: [],
      },
      "@fixture/b": {
        path: "packages/b",
        owner: "test",
        role: "contracts",
        allows: [],
      },
    },
  };
  for (const [name, source] of [
    ["a", a],
    ["b", b],
  ]) {
    const path = join(root, "packages", name!);
    mkdirSync(join(path, "src"), { recursive: true });
    writeFileSync(join(path, "src", "index.ts"), source!);
    writeFileSync(
      join(path, "package.json"),
      JSON.stringify({
        name: "@fixture/" + name,
        dependencies: name === "a" ? dependencies : {},
        exports: { ".": "./src/index.ts" },
      }),
    );
    writeFileSync(
      join(path, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext" },
      }),
    );
  }
  return {
    root,
    policy,
    check: () => inspect(root, policy).violations,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
describe("architecture rejection fixtures", () => {
  for (const [from, to] of [
    ["contracts", "domain"], ["domain", "application"],
    ["application", "infrastructure"], ["application", "presentation"],
    ["presentation", "infrastructure"], ["infrastructure", "presentation"],
  ]) test(`feature-local ${from} cannot import ${to}, including type-only edges`, () => {
    const f = fixture("");
    f.policy.layers.infrastructure = ["contracts", "domain", "application"];
    f.policy.layers.presentation = ["contracts", "domain", "application"];
    try {
      const source = `packages/a/src/features/sample/${from}`;
      const target = `packages/a/src/features/sample/${to}`;
      mkdirSync(join(f.root, source), { recursive: true });
      mkdirSync(join(f.root, target), { recursive: true });
      writeFileSync(join(f.root, source, "consumer.ts"), `import type {Value} from '../${to}/value'; export type Use=Value;`);
      writeFileSync(join(f.root, target, "value.ts"), "export type Value=string;");
      const violation = f.check().find(v => v.rule === "layer-edge");
      expect(violation?.file).toBe(source + "/consumer.ts");
      expect(violation?.message).toContain("inject");
    } finally { f.dispose(); }
  });
  for (const [name, source, rules] of [
    [
      "undeclared forbidden edge",
      `import '@fixture/b';`,
      ["undeclared", "package-edge"],
    ],
    [
      "relative private import",
      `export * from '../../b/src/index';`,
      ["private-import", "undeclared", "package-edge"],
    ],
    ["deep import", `import '@fixture/b/src/index';`, ["private-import"]],
    ["dynamic import", `const path='x'; import(path);`, ["unresolved-dynamic"]],
    ["browser singleton", `document.title='bad';`, ["browser-global"]],
    ["platform dependency", `import fs from 'node:fs';`, ["portable-layer"]],
  ] as const)
    test(name, () => {
      const f = fixture(source);
      try {
        const actual = f.check().map((item) => item.rule);
        for (const rule of rules) expect(actual).toContain(rule);
      } finally {
        f.dispose();
      }
    });
  test("type-only cycles", () => {
    const f = fixture(
      `import type {B} from '../../b/src/index'; export type A=B;`,
      `import type {A} from '../../a/src/index'; export type B=A;`,
    );
    try {
      expect(f.check().map((item) => item.rule)).toContain("package-cycle");
    } finally {
      f.dispose();
    }
  });
  test("upward internal dependency", () => {
    const f = fixture(`import './composition/start';`);
    try {
      mkdirSync(join(f.root, "packages/a/src/composition"));
      writeFileSync(
        join(f.root, "packages/a/src/composition/start.ts"),
        "export {};",
      );
      expect(f.check().map((item) => item.rule)).toContain("layer-edge");
    } finally {
      f.dispose();
    }
  });
  test("declared public dynamic import allowed", () => {
    const f = fixture(`import('@fixture/b');`, "", { "@fixture/b": "*" });
    f.policy.packages["@fixture/a"]!.allows = ["@fixture/b"];
    try {
      expect(f.check()).toEqual([]);
    } finally {
      f.dispose();
    }
  });
  test("exceptions cannot silently grow", () => {
    const f = fixture("");
    f.policy.exceptions.push({
      file: "x",
      target: "x",
      rule: "x",
      owner: "x",
      reason: "x",
    });
    try {
      expect(f.check().map((item) => item.rule)).toContain("exception-budget");
    } finally {
      f.dispose();
    }
  });
});

test("changed contracts include transitive dependents", () => {
  const packages = [
    { name: "contracts", path: "packages/contracts", allows: [] },
    { name: "runtime", path: "packages/runtime", allows: ["contracts"] },
    { name: "sdk", path: "packages/sdk", allows: ["runtime"] },
    { name: "independent", path: "packages/other", allows: [] },
  ];
  expect(
    affectedPackages(packages, ["packages/contracts/src/index.ts"]),
  ).toEqual(["contracts", "runtime", "sdk"]);
  expect(affectedPackages(packages, ["packages/other/src/index.ts"])).toEqual([
    "independent",
  ]);
});
test("manifest-only cycles fail without a source import", () => {
  const f = fixture("", "", { "@fixture/b": "*" });
  try {
    const path = join(f.root, "packages/b/package.json");
    writeFileSync(
      path,
      JSON.stringify({
        name: "@fixture/b",
        dependencies: { "@fixture/a": "*" },
        exports: { ".": "./src/index.ts" },
      }),
    );
    expect(f.check().map((item) => item.rule)).toContain("package-cycle");
  } finally {
    f.dispose();
  }
});

test("browser globals respect lexical scope", () => {
  const f = fixture(
    `function injected(window: {x:number}) { return window.x; } window.location.href;`,
  );
  try {
    expect(
      f.check().filter((item) => item.rule === "browser-global"),
    ).toHaveLength(1);
  } finally {
    f.dispose();
  }
});
test("injected document parameter is portable", () => {
  const f = fixture(
    `export function render(document: string) { return document; }`,
  );
  try {
    expect(f.check()).toEqual([]);
  } finally {
    f.dispose();
  }
});
test("explicit globalThis browser access is rejected", () => {
  const f = fixture(`globalThis.document.title;`);
  try {
    expect(f.check().map((item) => item.rule)).toContain("browser-global");
  } finally {
    f.dispose();
  }
});
test("stale migration exception is rejected", () => {
  const f = fixture("");
  f.policy.exceptionLimit = 1;
  f.policy.exceptions.push({
    file: "packages/a/src/index.ts",
    target: "document",
    rule: "browser-global",
    owner: "test",
    reason: "migration",
  });
  try {
    expect(f.check().map((item) => item.rule)).toContain("stale-exception");
  } finally {
    f.dispose();
  }
});
test("workspace packages must have a policy owner", () => {
  const f = fixture("");
  writeFileSync(
    join(f.root, "package.json"),
    JSON.stringify({ workspaces: ["packages/*"] }),
  );
  delete f.policy.packages["@fixture/b"];
  try {
    expect(f.check().map((item) => item.rule)).toContain("unowned-package");
  } finally {
    f.dispose();
  }
});
test("alias imports resolve through package tsconfig", () => {
  const f = fixture(`import '@/other';`);
  writeFileSync(
    join(f.root, "packages/a/tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    }),
  );
  writeFileSync(join(f.root, "packages/a/src/other.ts"), "export {};");
  try {
    expect(f.check()).toEqual([]);
  } finally {
    f.dispose();
  }
});
test("symlink imports retain real target ownership", () => {
  const f = fixture(`import './linked/index';`);
  symlinkSync(
    join(f.root, "packages/b/src"),
    join(f.root, "packages/a/src/linked"),
    "junction",
  );
  try {
    expect(f.check().map((item) => item.rule)).toContain("private-import");
  } finally {
    f.dispose();
  }
});
test("duplicate source violations produce one diagnostic", () => {
  const f = fixture(`document.title; document.title;`);
  try {
    expect(
      f.check().filter((item) => item.rule === "browser-global"),
    ).toHaveLength(1);
  } finally {
    f.dispose();
  }
});

test("internal type-only cycles require an exact reviewed edge set", () => {
  const f = fixture(`import type {B} from './other'; export type A=B;`);
  try {
    writeFileSync(
      join(f.root, "packages/a/src/other.ts"),
      `import type {A} from './index'; export type B=A;`,
    );
    const cycle = f.check().find((item) => item.rule === "module-cycle")!;
    expect(cycle).toBeDefined();
    f.policy.exceptions = [
      {
        file: cycle.file,
        target: cycle.target,
        rule: cycle.rule,
        owner: "test",
        reason: "migration",
      },
    ];
    f.policy.exceptionLimit = 1;
    expect(f.check()).toEqual([]);
    writeFileSync(
      join(f.root, "packages/a/src/other.ts"),
      `import type {A} from './index'; import './third'; export type B=A;`,
    );
    writeFileSync(join(f.root, "packages/a/src/third.ts"), `import './index';`);
    expect(f.check().some((item) => item.rule === "module-cycle")).toBe(true);
    expect(f.check().some((item) => item.rule === "stale-exception")).toBe(
      true,
    );
  } finally {
    f.dispose();
  }
});
