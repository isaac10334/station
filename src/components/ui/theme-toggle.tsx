import { ActionTooltip } from "@/components/ui/action-tooltip";
import { flushSync } from "react-dom";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { AppSettings } from "@/model";

type Theme = AppSettings["theme"];
type Props = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  className?: string;
};

let transitioning = false;

/** Space UI's circle reveal, adapted to the workspace store and data-theme tokens. */
export function changeTheme(theme: Theme, onThemeChange: (theme: Theme) => void, origin?: Element) {
  if (transitioning) return;
  const current = document.documentElement.dataset.theme;
  const next = theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : theme;
  const apply = () => {
    document.documentElement.dataset.theme = next;
    flushSync(() => onThemeChange(theme));
  };
  if (current === next || !origin || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return;
  }

  const bounds = origin.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
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
    void transition.finished.catch(() => {}).finally(() => {
      style.remove();
      transitioning = false;
    });
  } catch {
    style.remove();
    transitioning = false;
    apply();
  }
}

export function ThemeToggle({ theme, onThemeChange, className = "icon-button" }: Props) {
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const dark = theme === "system" ? systemDark : theme === "dark";
  const next = dark ? "light" : "dark";
  return <ActionTooltip label={`Switch to ${next} theme`}><button type="button" className={className} aria-label={`Switch to ${next} theme`} onClick={(event) => changeTheme(next, onThemeChange, event.currentTarget)}>
    {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
  </button></ActionTooltip>;
}
