import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { patchBrowserNative } from "./patch-browser-native";

/** Rebuild only the Windows wrapper, keeping the pinned core ABI. Downloads
 * are immutable and SHA256 checked; neither Hutch's shared cache nor installed
 * applications are modified. CEF libraries are link-time upstream dependencies;
 * Station ships and runs native WebView2 only. Requires VS2022 C++ and CMake.
 */
const app = resolve(import.meta.dir, "..");
const cache = join(app, ".desktop-test/native");
export const nativeBrowserDLL = join(
  app,
  ".hutch/native-browser/libNativeWrapper.dll",
);

export async function buildBrowserNative() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error(
      "The browser native patch currently supports Windows x64 only.",
    );
  const manifest = await Bun.file(join(app, "package.json")).json();
  if (
    manifest.devDependencies.electrobun !== "2.0.3-beta.26" ||
    !(await Bun.file(join(app, "hutch.config.ts")).text()).includes(
      '"2.0.3-beta.26"',
    )
  )
    throw new Error(
      "Re-audit the native patch before changing the Electrobun pin.",
    );
  await mkdir(cache, { recursive: true });
  const run = (
    cmd: string[],
    env?: Record<string, string | undefined>,
    cwd = cache,
  ) => {
    const result = Bun.spawnSync(cmd, {
      cwd,
      env,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode) throw new Error(`Native build failed: ${cmd[0]}`);
  };
  const archive = async (
    name: string,
    url: string,
    sha: string,
    destination: string,
    strip = false,
  ) => {
    const path = join(cache, name);
    if (!(await Bun.file(path).exists())) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed: ${url}`);
      await Bun.write(path, response);
    }
    const hash = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(path).arrayBuffer())
      .digest("hex");
    if (hash !== sha)
      throw new Error(`Native dependency checksum mismatch: ${name}`);
    const stamp = Bun.file(join(destination, `.station-extracted-${name}`));
    if (await stamp.text().catch(() => "") !== sha) {
      await mkdir(destination, { recursive: true });
      run([
        "tar",
        "-xf",
        path,
        "-C",
        destination,
        ...(strip ? ["--strip-components=1"] : []),
      ]);
      await Bun.write(join(destination, `.station-extracted-${name}`), sha);
    }
  };
  await archive(
    "source-beta26.zip",
    "https://codeload.github.com/blackboardsh/electrobun/zip/refs/tags/v2.0.3-beta.26",
    "97a49f23bbd72679ac11348750eb69aae161d4f0023fa7508610fe610deb205b",
    cache,
  );
  const source = join(cache, "electrobun-2.0.3-beta.26/package/src/native");
  await archive(
    "cef.tar.bz2",
    "https://cef-builds.spotifycdn.com/cef_binary_147.0.10%2Bgd58e84d%2Bchromium-147.0.7727.118_windows64_minimal.tar.bz2",
    "41aa67ef79f9d202636e5f2365c68f447de7b26b1c84e6f318bbdcc0e037c16c",
    join(cache, "cef"),
    true,
  );
  await archive(
    "dawn.tar.gz",
    "https://electrobun-artifacts.blackboard.sh/electrobun-dawn/releases/0.2.6/electrobun-dawn-win32-x64.tar.gz",
    "cac1f91b7ce9172a084ce6476649a813b557c3b0b4ee4536e98f28784a5bcd33",
    join(cache, "dawn"),
  );
  await archive(
    "webview2.zip",
    "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg",
    "56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9",
    join(cache, "webview2"),
  );
  const vswhere = join(
    process.env["ProgramFiles(x86)"]!,
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  const vs = Bun.spawnSync([
    vswhere,
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ]);
  const installation = vs.stdout.toString().trim();
  if (!installation)
    throw new Error(
      "VS2022 C++ build tools are required for the native browser policy patch.",
    );
  const envScript = join(cache, "msvc-environment.cmd");
  await writeFile(
    envScript,
    `@call "${join(installation, "Common7/Tools/VsDevCmd.bat")}" -arch=x64 >nul\r\n@if errorlevel 1 exit /b 1\r\n@set\r\n`,
  );
  const environment = Bun.spawnSync(["cmd.exe", "/d", "/c", envScript]);
  if (environment.exitCode)
    throw new Error("Cannot initialize the MSVC environment.");
  const env: Record<string, string> = {};
  for (const line of environment.stdout.toString().split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at > 0) env[line.slice(0, at)] = line.slice(at + 1);
  }
  const cmake = join(
    installation,
    "Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe",
  );
  const wrapper = join(
    cache,
    "cef-build/libcef_dll_wrapper/Release/libcef_dll_wrapper.lib",
  );
  if (!(await Bun.file(wrapper).exists())) {
    run(
      [
        cmake,
        "-S",
        join(cache, "cef"),
        "-B",
        join(cache, "cef-build"),
        "-G",
        "Visual Studio 17 2022",
        "-A",
        "x64",
        "-DUSE_SANDBOX=OFF",
      ],
      env,
    );
    run(
      [
        cmake,
        "--build",
        join(cache, "cef-build"),
        "--config",
        "Release",
        "--target",
        "libcef_dll_wrapper",
        "--parallel",
      ],
      env,
    );
  }
  const patched = join(cache, "patched");
  await cp(source, patched, { recursive: true });
  const input = await readFile(join(source, "win/nativeWrapper.cpp"), "utf8");
  await writeFile(
    join(patched, "win/nativeWrapper.cpp"),
    patchBrowserNative(input),
  );
  await cp(
    join(app, "desktop/native/station-browser.h"),
    join(patched, "win/station-browser.h"),
  );
  await mkdir(join(app, ".hutch/native-browser"), { recursive: true });
  const webview = join(cache, "webview2/build/native");
  const dawn = join(cache, "dawn/win32-x64");
  const object = join(cache, "nativeWrapper.obj");
  run(
    [
      "cl.exe",
      "/nologo",
      "/c",
      "/EHsc",
      "/std:c++20",
      "/DNOMINMAX",
      "/MT",
      "/utf-8",
      `/I${join(webview, "include")}`,
      `/I${join(cache, "cef")}`,
      `/I${join(dawn, "include")}`,
      "/D_USRDLL",
      "/D_WINDLL",
      `/Fo${object}`,
      join(patched, "win/nativeWrapper.cpp"),
    ],
    env,
  );
  run(
    [
      "link.exe",
      "/nologo",
      "/DLL",
      "/MANIFEST:EMBED",
      `/OUT:${nativeBrowserDLL}`,
      object,
      "user32.lib",
      "ole32.lib",
      "oleaut32.lib",
      "shell32.lib",
      "shlwapi.lib",
      "advapi32.lib",
      "dcomp.lib",
      "d2d1.lib",
      "d3d12.lib",
      "kernel32.lib",
      "comctl32.lib",
      "urlmon.lib",
      "ws2_32.lib",
      "windowsapp.lib",
      join(dawn, "lib/webgpu_dawn.lib"),
      join(webview, "x64/WebView2LoaderStatic.lib"),
      join(cache, "cef/Release/libcef.lib"),
      wrapper,
      "delayimp.lib",
      "/DELAYLOAD:libcef.dll",
      "/DELAYLOAD:webgpu_dawn.dll",
      "libcmt.lib",
    ],
    env,
  );
  console.log(`Built Station browser policy ABI 1: ${nativeBrowserDLL}`);
}
if (import.meta.main) await buildBrowserNative();
