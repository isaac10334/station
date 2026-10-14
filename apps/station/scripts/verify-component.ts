import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { Translator } from "@polyengine/runtime/shim";
import { instantiate } from "@polyengine/runtime/embedder";
import { inspectComponentPlan } from "../src/providers/component-plan";
import { createRunTabProviders } from "../src/providers/run-providers";
import { REQUIRED_GRANTS } from "../src/core/component-contract";
import { sha256 } from "../src/core/build-contract";

const artifact = new Uint8Array(await Bun.file(new URL("../../../components/greeting/target/wasm32-wasip2/release/greeting.wasm", import.meta.url)).arrayBuffer());
const shim = new Uint8Array(await Bun.file(join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm")).arrayBuffer());
const translator = await Translator.create(shim);
const translated = translator.translate(artifact);
const inspected = inspectComponentPlan(translated.plan);
const providers = createRunTabProviders(new Set(REQUIRED_GRANTS), new AbortController().signal);
const instance = await instantiate({ plan: translated.plan, adapters: translated.adapters, componentBytes: artifact }, providers.imports);
const output = await instance.exports.run("World");
const effects = providers.snapshot();
if (output !== "Hello, World!" || effects.surfaceText !== output || effects.logs.length !== 1)
  throw new Error(`Unexpected P3 behavior: ${JSON.stringify({ output, effects })}`);
console.log(JSON.stringify({ profile: "component-model-0.3", hash: await sha256(artifact), bytes: artifact.byteLength,
  translatorHash: translator.buildHash, imports: inspected.imports, worldDigest: inspected.worldDigest, output, ...effects }));
