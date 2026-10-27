import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  importPackage,
  parseManifest,
  packageMembers,
  type PackageInstallation,
} from "../src/core/package-assets";
import { forkInstallation } from "../src/core/fork-package";
import { parseTheme } from "../src/core/theme-assets";
import { draftSchema,programFiles,parseProgramAsset } from '../src/core/programs';

test('import remaps selected script dependencies and excludes instance authority',()=>{
 const helper={id:'helper',kind:'script',name:'Helper',files:programFiles(draftSchema.parse({role:'action',entry:'helper.ts',files:{'helper.ts':'export const value=42;'}}))};
 const source={id:'script',kind:'script',name:'Script',files:programFiles(draftSchema.parse({role:'action',dependencies:['helper'],entry:'main.ts',files:{'main.ts':"import {value} from '@selected/helper/helper.ts'; export default ()=>value;"}}))};
 const imported=importPackage(JSON.stringify({format:'station-package',version:1,assets:[helper,source]}),[helper,source] as any);
 const script=imported.find(asset=>asset.id==='script-2')!;
 expect(parseProgramAsset(script.files!).dependencies).toEqual(['helper-2']);
 expect(script.files!['main.ts']).toContain('@selected/helper-2/helper.ts');
 expect('bindings' in script).toBe(false);
 expect(()=>importPackage(JSON.stringify({format:'station-package',version:1,assets:[source]}),[])).toThrow('missing');
});
test('portable widget recipes retain their source and selected dependencies when imported',()=>{
 const draft=draftSchema.parse({role:'widget',dependencies:['helper'],files:{'main.tsx':"import {value} from '@selected/helper/helper.ts'; export default ()=>value;"}});
 const helper={id:'helper',kind:'script',name:'Helper',files:programFiles(draftSchema.parse({role:'action',files:{'helper.ts':'export const value=42'}}))};
 const widget={id:'widget',kind:'widget-definition',name:'Widget',files:{'widget.json':JSON.stringify({version:1,widget:'program',defaults:{programDraft:draft}})}};
 const imported=importPackage(JSON.stringify({format:'station-package',version:1,assets:[widget,helper]}),[widget,helper] as any);
 const source=parseProgramAsset(imported.find(asset=>asset.id==='widget-2')!.files!);
 expect(source.dependencies).toEqual(['helper-2']);
 expect(source.files['main.tsx']).toContain('@selected/helper-2/helper.ts');
});
test("forking an installed snapshot creates independent package identity and remaps theme icon resources", () => {
  const assets = importPackage(
    readFileSync(
      new URL(
        "../../../docs/examples/svg-studio.station.json",
        import.meta.url,
      ),
      "utf8",
    ),
    [],
  );
  const author = assets.find((asset) => asset.kind === "package")!,
    manifest = parseManifest(author.files!["station.json"]!);
  const installation: PackageInstallation = {
    id: manifest.id,
    name: manifest.name,
    packageAssetId: author.id,
    revision: 0,
    enabled: true,
    manifest,
    assets: packageMembers(manifest, assets),
    builds: {},
    grants: { editor: ["station:editor/session"] },
  };
  const fork = forkInstallation(installation, assets),
    copy = fork.assets.find((asset) => asset.kind === "package")!;
  expect(parseManifest(copy.files!["station.json"]!).id).not.toBe(manifest.id);
  expect(fork.packageId).not.toBe(author.id);
  const theme = fork.assets.find((asset) => asset.kind === "theme")!;
  const reference = parseTheme(theme.files!["theme.json"]!).icons!.Share;
  expect(
    fork.assets.find((asset) => asset.id === reference.assetId)?.files?.[
      reference.path
    ],
  ).toContain("<svg");
  expect(
    fork.assets.some(
      (asset) => "grants" in asset && Object.values(asset.grants).some(Boolean),
    ),
  ).toBe(false);
});
