import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
/** Restrict the directory before writing. POSIX modes alone do not protect Windows files. */
export async function saveCredential(directory: string, value: unknown) {
  const path = resolve(directory);
  if (existsSync(path))
    throw new Error(
      "Choose a new credential directory; existing ACLs are not modified",
    );
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === "win32") {
    const identity = Bun.spawnSync(["whoami", "/user", "/fo", "csv", "/nh"]),
      sid = identity.stdout.toString().match(/S-1-5-[0-9-]+/)?.[0];
    if (!sid || identity.exitCode !== 0)
      throw new Error(
        "Cannot establish credential owner; no credential written",
      );
    const result = Bun.spawnSync([
      "icacls",
      path,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:(OI)(CI)F`,
    ]);
    if (result.exitCode !== 0)
      throw new Error(
        "Cannot restrict credential directory ACL; no credential written",
      );
  }
  const file = join(path, "credential.json");
  writeFileSync(file, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  return file;
}
