import { copyFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

/** Runs before release wrapping/signing, never edits the shared Hutch cache. */
if (process.env.ELECTROBUN_OS === "win") {
  if (process.env.ELECTROBUN_ARCH !== "x64")
    throw new Error("Browser policy patch requires Windows x64.");
  const directory = process.env.ELECTROBUN_BUILD_DIR;
  const name = process.env.ELECTROBUN_APP_NAME;
  if (!directory || !name)
    throw new Error("Missing Electrobun build hook context.");
  const candidates = [
    join(
      directory,
      `${name}-${process.env.ELECTROBUN_BUILD_ENV}`,
      "bin/libNativeWrapper.dll",
    ),
    join(directory, name, "bin/libNativeWrapper.dll"),
    join(directory, "bin/libNativeWrapper.dll"),
  ];
  const target = candidates.find(existsSync);
  if (!target)
    throw new Error(`Cannot locate the native wrapper in ${directory}`);
  copyFileSync(resolve(".hutch/native-browser/libNativeWrapper.dll"), target);
  const brandArgs=["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    resolve("scripts/brand-windows-executable.ps1"), "-Icon", resolve("../../packages/ui/assets/station.ico"),
    "-BunPath", join(dirname(target), "bun.exe"), "-LauncherPath", join(dirname(target), "launcher.exe")];
  // Windows can hold a just-written PE briefly after Hutch's own icon update.
  // Retry only this build-local branding step; never touch another installation.
  for(let attempt=0;;attempt++){try{execFileSync('powershell.exe',brandArgs,{stdio:'inherit',windowsHide:true});break;}catch(error){if(attempt>=2)throw error;await Bun.sleep(250);}}
  console.log("Installed Station browser policy ABI 1 into the app bundle.");
}
