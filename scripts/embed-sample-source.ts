/** Bundle editable sample source; executable bytes are always built on demand. */
const root = new URL("../components/greeting/", import.meta.url);
const files = [
  "Cargo.toml", "Cargo.lock", "src/lib.rs", "wit/world.wit",
  "wit/deps/wasi-clocks/monotonic-clock.wit", "wit/deps/wasi-clocks/types.wit",
];
const source = Object.fromEntries(await Promise.all(files.map(async (path) => [
  path, await Bun.file(new URL(path, root)).text(),
])));
await Bun.write(new URL("../src/generated/greeting.ts", import.meta.url),
  `// Generated editable source only. Run: bun scripts/embed-sample-source.ts\n` +
  `export const greetingSource: Record<string, string> = ${JSON.stringify(source, null, 2)};\n`);
console.log(`Embedded ${files.length} sample source files`);
