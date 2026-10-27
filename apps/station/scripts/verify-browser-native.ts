import { dlopen, FFIType } from "bun:ffi";
import { nativeBrowserDLL } from "./build-browser-native";

/** Tests the compiled policy, not a TypeScript copy of its rules. No app or
 * browser process is created. Run after rebuilding the pinned native wrapper.
 */
const library = dlopen(nativeBrowserDLL, {
  stationBrowserABI: { args: [], returns: FFIType.i32 },
  stationBrowserCheckURL: { args: [FFIType.cstring], returns: FFIType.bool },
});
try {
  if (library.symbols.stationBrowserABI() !== 1)
    throw new Error("Browser ABI mismatch");
  const cases: [string, boolean][] = [
    ["https://example.com/", true],
    ["https://www.wikipedia.org/", true],
    ["http://93.184.216.34/", true],
    ...[
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://localhost./",
      "https://x.localhost/",
      "http://a.local/",
      "http://localhost.localdomain/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://10.1.2.3/",
      "http://172.31.1.2/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.64.1.1/",
      "http://0.0.0.0/",
      "http://224.0.0.1/",
      "https://example.com:43157/api",
      "https://user:password@example.com/",
      "https://example.com\\@localhost/",
      "file:///C:/test",
      "views://app/",
      "appdata://app/",
      "javascript:alert(1)",
      "data:text/html,x",
      "mailto:user@example.com",
      "https://example.com/\n",
    ].map((url): [string, boolean] => [url, false]),
  ];
  for (const [url, expected] of cases) {
    const allowed = library.symbols.stationBrowserCheckURL(
      new TextEncoder().encode(url + "\0"),
    );
    if (allowed !== expected)
      throw new Error(`Native URL policy mismatch: ${url}`);
  }
  console.log(
    `Native browser ABI and ${cases.length} compiled URL policy cases passed.`,
  );
} finally {
  library.close();
}
