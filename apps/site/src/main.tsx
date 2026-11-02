import { useEffect, useState } from "react";
import { canaryInstaller } from "./canary-release";
import { ThemeToggle, type ThemeSelection } from "@station/ui/theme-toggle";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Code, Columns, Palette, ArrowRight } from "@station/ui/icons";

const modes = [
  { name: "Arrange", icon: Columns },
  { name: "Build", icon: Code },
  { name: "Make it yours", icon: Palette },
];
/** A lightweight CSS perspective placeholder; no GPU renderer, continuous loop, or video. */
function WorkspaceScene() {
  const [mode, setMode] = useState(0);
  const reduce = useReducedMotion();
  return (
    <div className="scene-content">
      <div
        className="desk-stage"
        aria-label="Interactive workspace illustration"
      >
        <div className="platform-shadow" />
        <div className="isometric-desk">
          <div className="desk-floor" />
          <AnimatePresence mode="popLayout">
            {["Files", "Code", "Preview"].map((name, index) => (
              <motion.div
                className={`demo-panel panel-${index} ${mode === 2 ? "warm" : ""}`}
                key={name}
                layout
                animate={{
                  x:
                    mode === 0
                      ? [0, 0, 0][index]
                      : mode === 1
                        ? [0, -24, 24][index]
                        : [8, -8, 0][index],
                  y: mode === 1 ? [20, -12, 4][index] : 0,
                }}
                transition={{
                  duration: reduce ? 0 : 0.45,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="demo-panel-header">
                  <span className="mini-dot" />
                  {name}
                  <span className="mini-action">+</span>
                </div>
                {index === 0 ? (
                  <div className="demo-files">
                    <span>⌄ &nbsp; src</span>
                    <span>　 main.tsx</span>
                    <span className={mode === 2 ? "highlight" : ""}>
                      　 theme.json
                    </span>
                    <span>⌄ &nbsp; assets</span>
                    <span>　 station.svg</span>
                  </div>
                ) : index === 1 ? (
                  <div className="demo-code">
                    <span className="code-muted">
                      // a little room to create
                    </span>
                    <span>
                      const <b>station</b> = await connect();
                    </span>
                    <span />
                    <span>
                      const <b>desk</b> = station.state(
                    </span>
                    <span>
                      　<i>"your-next-idea"</i>
                    </span>
                    <span>);</span>
                    <span />
                    <span>
                      desk.set(<i>"Hello, world."</i>);
                    </span>
                  </div>
                ) : (
                  <div className="demo-preview">
                    <motion.div
                      className="station-mark"
                      animate={{ rotate: mode === 2 ? 90 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.5 }}
                    >
                      S
                    </motion.div>
                    <span>A space to make things.</span>
                    <div className="preview-pills">
                      <span>Code</span>
                      <span>Ideas</span>
                      <span>You</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="station-track">
            <div className="track-line" />
            <motion.div
              className="train"
              animate={{ x: mode * 65 }}
              transition={{
                duration: reduce ? 0 : 0.6,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <span />
              <span />
              <span />
            </motion.div>
          </div>
        </div>
      </div>
      <div
        className="scene-controls"
        role="group"
        aria-label="Explore the workspace"
      >
        {modes.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={mode === index}
            onClick={() => setMode(index)}
          >
            <item.icon size={15} />
            {item.name}
            {mode === index && (
              <motion.span
                layoutId="scene-selection"
                className="selection-line"
                transition={{ duration: reduce ? 0 : 0.2 }}
              />
            )}
          </button>
        ))}
      </div>
      <p className="scene-caption">
        Arrange widgets. Keep your code and preview together.
        <ArrowRight size={14} />
      </p>
    </div>
  );
}
createRoot(document.getElementById("scene")!).render(<WorkspaceScene />);
function SiteThemeToggle() {
  const [theme, setTheme] = useState<ThemeSelection>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  return (
    <ThemeToggle
      className="theme-toggle"
      theme={theme}
      onThemeChange={(next) => {
        setTheme(next);
        try {
          localStorage.setItem("station.site.theme", next);
        } catch {}
      }}
    />
  );
}
createRoot(document.getElementById("theme-control")!).render(
  <SiteThemeToggle />,
);

/** Always query the canary tag, never GitHub's stable-only latest endpoint. */
async function resolveCanary() {
  const status = document.getElementById("release-status")!,
    link = document.getElementById("download") as HTMLAnchorElement;
  try {
    const response = await fetch(
      "https://api.github.com/repos/isaac10334/station/releases/tags/canary",
      {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) throw new Error("Release lookup failed");
    const asset = canaryInstaller(await response.json());
    link.href = asset.url;
    status.textContent = `Windows x64 · Canary · Installer · ${Math.round(asset.size / 1024 / 1024)} MB`;
  } catch {
    status.textContent =
      "Windows x64 · Canary · Check release notes if unavailable";
  }
}
void resolveCanary();
