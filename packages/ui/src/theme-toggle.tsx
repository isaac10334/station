import { flushSync } from "react-dom";
import { useEffect, useState, type ComponentPropsWithRef } from "react";
import { Moon, Sun } from "./icons.js";
export type ThemeSelection = "dark" | "light" | "system";
type Theme = ThemeSelection;
let transitioning = false;

/** Space UI's circle reveal, adapted to the workspace store and data-theme tokens. */
export function changeTheme(
  theme: Theme,
  onThemeChange: (theme: Theme) => void,
  origin?: Element,
) {
  if (transitioning) return;
  const current = document.documentElement.dataset.theme;
  const next =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const apply = () => {
    document.documentElement.dataset.theme = next;
    flushSync(() => onThemeChange(theme));
  };
  if (
    current === next ||
    !origin ||
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }

  const bounds = origin.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  const style = document.createElement("style");
  style.dataset.themeTransition = "";
  style.textContent = `
    ::view-transition-old(root) { animation: none; }
    ::view-transition-new(root) { animation: workspace-theme-reveal 700ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    @keyframes workspace-theme-reveal {
      from { clip-path: circle(0px at ${x}px ${y}px); }
      to { clip-path: circle(${radius}px at ${x}px ${y}px); }
    }
  `;
  document.head.append(style);
  transitioning = true;
  try {
    const transition = document.startViewTransition(apply);
    void transition.finished
      .catch(() => {})
      .finally(() => {
        style.remove();
        transitioning = false;
      });
  } catch {
    style.remove();
    transitioning = false;
    apply();
  }
}

/** Shared accessible theme control. The owner persists selection; this module owns the reveal. */
export function ThemeToggle({
  theme,
  onThemeChange,
  className,
  onClick,
  ...props
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
} & ComponentPropsWithRef<"button">) {
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const next = (theme === "system" ? systemDark : theme === "dark")
    ? "light"
    : "dark";
  return (
    <button
      {...props}
      type="button"
      className={className}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented)
          changeTheme(next, onThemeChange, event.currentTarget);
      }}
    >
      {next === "light" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
