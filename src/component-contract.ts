/** The current P3 guest contract and the distinct grants for its host effects. */
export const UNIT_HOST_INTERFACE = "unit:workspace/host@0.3.0";
export const UNIT_SURFACE_INTERFACE = "unit:workspace/surface@0.3.0";
export const P3_CLOCK_INTERFACE = "wasi:clocks/monotonic-clock@0.3.1";

export const HOST_LOG = "unit:workspace/host.log";
export const HOST_FEED = "unit:workspace/host.feed";
export const HOST_SURFACE = "unit:workspace/surface.set-text";
export const HOST_CLOCK = P3_CLOCK_INTERFACE;

export const REQUIRED_GRANTS = [HOST_LOG, HOST_FEED, HOST_SURFACE, HOST_CLOCK] as const;
