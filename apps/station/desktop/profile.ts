/** The acceptance installation has its own identity, data and loopback origin.
 * Never redirect an ordinary installed canary to a test feed or test profile.
 */
export function desktopProfile(acceptance: boolean, development = false) {
  if (acceptance && development) throw new Error("Acceptance and development profiles are mutually exclusive");
  if (development) return { identifier: "com.isaacharvey.station.development", port: 43159, origin: "http://127.0.0.1:43159" };
  return {
    identifier: acceptance
      ? "com.isaacharvey.station.acceptance"
      : "com.isaacharvey.station",
    port: acceptance ? 43158 : 43157,
    origin: acceptance ? "http://127.0.0.1:43158" : "http://127.0.0.1:43157",
  };
}
