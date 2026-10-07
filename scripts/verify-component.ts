import { Translator } from "@polyengine/runtime/shim";
import { instantiate } from "@polyengine/runtime/embedder";
import { inspectComponentPlan } from "../src/component-plan";
import { createRunTabProviders } from "../src/run-providers";
import { REQUIRED_GRANTS } from "../src/component-contract";
import { sha256 } from "../src/build-contract";

const artifact = new Uint8Array(await Bun.file(new URL("../components/greeting/target/wasm32-wasip2/release/greeting.wasm", import.meta.url)).arrayBuffer());
const shim = new Uint8Array(await Bun.file(new URL("../node_modules/@polyengine/translator/esm/translator_shim.wasm", import.meta.url)).arrayBuffer());
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
