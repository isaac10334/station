/** Fixed entrypoint for the provisioned OCI image. Never execute this on the host
 * for authored sources: Cargo/build scripts run only inside the OCI boundary. */
import { mkdir, writeFile, cp } from "node:fs/promises";
import { validateSource } from "../src/core/build-contract";
const input=await Bun.stdin.text(); if(input.length>300000)throw new Error("Source too large");
const source=validateSource(JSON.parse(input));
await mkdir("/tmp/cargo",{recursive:true}); await cp("/usr/local/cargo/registry","/tmp/cargo/registry",{recursive:true});
for(const [path,value] of Object.entries(source.files)){const target=`/work/${path}`;await mkdir(target.slice(0,target.lastIndexOf("/")),{recursive:true});await writeFile(target,value);}
const process=Bun.spawn(["/usr/local/cargo/bin/cargo","+nightly-2026-09-08","build","--release","--offline","--locked","--target","wasm32-wasip2","--manifest-path","/work/Cargo.toml"],{cwd:"/work",env:{PATH:"/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin",RUSTUP_HOME:"/usr/local/rustup",CARGO_HOME:"/tmp/cargo",CARGO_TARGET_DIR:"/work/target"},stdout:"pipe",stderr:"pipe"});
const consume=async(stream:ReadableStream<Uint8Array>)=>{const reader=stream.getReader();let total=0,tail="";for(;;){const{done,value}=await reader.read();if(done)break;total+=value.length;if(total>128000){process.kill();throw new Error("Compiler diagnostic limit");}tail=(tail+new TextDecoder().decode(value)).slice(-12000);}return tail;};
const [_,error,code]=await Promise.all([consume(process.stdout),consume(process.stderr),process.exited]);if(code!==0)throw new Error(error || "Component compiler failed");
const artifact=Bun.file(`/work/target/wasm32-wasip2/release/${source.id.replaceAll("-","_")}.wasm`);if(artifact.size>5000000)throw new Error("Artifact too large");
console.log(JSON.stringify({bytes:Buffer.from(await artifact.arrayBuffer()).toString("base64"),toolchain:"rust-nightly-2026-09-08/wasm32-wasip2/oci-v1"}));
