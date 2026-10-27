import { BuildFailure, validateSource, type BuildSource } from "../src/core/build-contract";
/** Read bounded compiler output. A misbehaving compiler cannot grow host buffers
 * indefinitely; source and artifacts cross pipes, never host-directory mounts. */
async function bounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
  const reader = stream.getReader(); let size = 0; const parts: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new BuildFailure("Compiler output exceeded its limit", 422); parts.push(value); } }
  finally { reader.releaseLock(); }
  const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return new TextDecoder().decode(output);
}
export function ociImage(value: string | undefined): string {
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9._/:~-]*@sha256:[a-f0-9]{64}$/.test(value)) throw new BuildFailure("Configure STATION_COMPONENT_BUILDER_IMAGE with an immutable image@sha256:digest", 503);
  return value;
}
/** Explicit OCI sandbox: no network, mounts, credentials or ambient host env.
 * The image is operator-provisioned; assets cannot choose it or an entrypoint. */
export async function compileWithOCI(source: BuildSource, signal?: AbortSignal) {
  validateSource(source); const image = ociImage(process.env.STATION_COMPONENT_BUILDER_IMAGE);
  const executable = Bun.which("docker"); if (!executable) throw new BuildFailure("OCI compiler requires a configured Docker daemon; no host Cargo fallback is allowed", 503);
  signal?.throwIfAborted(); const name = `station-build-${crypto.randomUUID()}`;
  const child = Bun.spawn([executable, "run", "--pull=never", "--name", name, "--rm", "-i", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=1g", "--cpus=2", "--pids-limit=128", "--user=10001:10001", "--tmpfs=/work:rw,nosuid,nodev,size=512m,uid=10001,gid=10001", "--tmpfs=/tmp:rw,nosuid,nodev,size=256m,uid=10001,gid=10001", "--entrypoint=/usr/local/bin/bun", image, "/opt/station/build.ts"], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "", ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}) } });
  const remove = async () => { child.kill(); const cleanup = Bun.spawn([executable,"rm","--force",name],{stdout:"ignore",stderr:"ignore"}); await cleanup.exited; };
  const abort = () => { void remove(); }; signal?.addEventListener("abort",abort,{once:true}); const timeout=setTimeout(abort,10*60_000);
  try { await child.stdin.write(JSON.stringify(source)); await child.stdin.end(); const [output,errors,code]=await Promise.all([bounded(child.stdout,7_000_000),bounded(child.stderr,64_000),child.exited]); signal?.throwIfAborted(); if(code!==0)throw new BuildFailure(`OCI Component compile failed: ${errors.slice(-12000)}`,422); const result=JSON.parse(output); if(typeof result.bytes!=="string"||result.bytes.length>6_700_000||typeof result.toolchain!=="string")throw new BuildFailure("Invalid OCI compiler result",422); return {bytes:new Uint8Array(Buffer.from(result.bytes,"base64")),toolchain:result.toolchain,environmentId:image}; }
  finally { clearTimeout(timeout);signal?.removeEventListener("abort",abort);await remove(); }
}
