// Adapted from https://stealth.pm/r/color-picker.json
"use client";
import { parseThemeColor, type Rgba } from "../../../core/theme-color";
import { SettledInput, numberError } from "./settled-input";
import { Popover } from "@base-ui/react/popover";
import { Slider } from "@base-ui/react/slider";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronsUpDown } from "../../lib/icons";
import { ease, spring } from "../../lib/motion";
import { useControllableState } from "../../lib/use-controllable-state";

/* ───────────────────────── color math ───────────────────────── */
// Colors here are the data being edited, not the theme, so they are written as values.

export type { Rgba } from "../../../core/theme-color";
export type Hsva = { h: number; s: number; v: number; a: number };

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return {
    r: Math.round(f(5) * 255),
    g: Math.round(f(3) * 255),
    b: Math.round(f(1) * 255),
    a,
  };
}

/** Converts to HSV, keeping the previous hue (and saturation) where the color has none, so grays and black don't reset the hue slider. */
export function rgbToHsv({ r, g, b, a }: Rgba, prev?: Hsva): Hsva {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const max = Math.max(R, G, B),
    min = Math.min(R, G, B),
    d = max - min;
  let h = 0;
  if (d)
    h =
      max === R
        ? ((G - B) / d) % 6
        : max === G
          ? (B - R) / d + 2
          : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  const v = max;
  const s = max ? d / max : 0;
  return {
    h: d === 0 && prev ? prev.h : h,
    s: v === 0 && prev ? prev.s : s,
    v,
    a,
  };
}

const hex2 = (n: number) =>
  Math.round(n).toString(16).padStart(2, "0").toUpperCase();
export function toHex({ r, g, b, a }: Rgba) {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ""}`;
}

function rgbToHsl({ r, g, b }: Rgba) {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const max = Math.max(R, G, B),
    min = Math.min(R, G, B),
    l = (max + min) / 2,
    d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d)
    h =
      max === R
        ? ((G - B) / d) % 6
        : max === G
          ? (B - R) / d + 2
          : (R - G) / d + 4;
  return {
    h: Math.round((h * 60 + 360) % 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h: number, s: number, l: number, a: number): Rgba {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const c = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
    a,
  };
}

/** Same literal grammar as theme JSON. */
export const parseColor = parseThemeColor;

const FALLBACK: Hsva = { h: 0, s: 0, v: 0, a: 1 };
const toHsva = (value: string, prev?: Hsva) => {
  const rgb = parseColor(value);
  return rgb ? rgbToHsv(rgb, prev) : (prev ?? FALLBACK);
};
const hsvaHex = (c: Hsva) => toHex(hsvToRgb(c));
const cssOf = (c: Hsva) => {
  const { r, g, b, a } = hsvToRgb(c);
  return `rgb(${r} ${g} ${b} / ${a})`;
};

/* ───────────────────────── small pieces ───────────────────────── */

// A checkerboard drawn from theme lines, so transparency reads in both themes.
const checker =
  "[background-image:conic-gradient(var(--line-2)_25%,transparent_0_50%,var(--line-2)_0_75%,transparent_0)] [background-size:8px_8px] bg-raised";

// Double ring: inner in the surface color, outer in the text color, so a thumb reads on any hue in either theme.
const thumbRing =
  "border-2 border-raised shadow-[0_0_0_1px_color-mix(in_oklab,var(--fg)_45%,transparent),0_2px_6px_-1px_rgb(0_0_0/0.35)]";

const EYE_DROPPER = () => "EyeDropper" in window;
const useEyeDropperSupport = () =>
  useSyncExternalStore(
    () => () => {},
    EYE_DROPPER,
    () => false,
  );

type EyeDropperCtor = new () => {
  open: (o?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
};

function PipetteIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.75 3.9 11 2.65a1.6 1.6 0 0 1 2.35 2.35L12.1 6.25" />
      <path d="m8.6 5.05 2.35 2.35" />
      <path d="M9.8 6.2 4.4 11.6 3 13l-.25-.25L4.15 11.3 9.55 5.95" />
    </svg>
  );
}

/* ───────────────────────── the panel ───────────────────────── */

type Format = "css" | "rgb" | "hsl";
const FORMATS: Format[] = ["css", "rgb", "hsl"];

export type ColorPickerPanelProps = Omit<
  React.ComponentProps<"div">,
  "defaultValue" | "onChange"
> & {
  /** A literal hex, rgb(a), hsl(a), or oklch color, matching theme JSON. */
  value?: string;
  defaultValue?: string;
  /** Drag edits emit sRGB hex; settled text edits retain their literal color format. */
  onValueChange?: (hex: string) => void;
  /** Fires once when a change settles: pointer up, Enter or blur in a field, a swatch, the eyedropper. */
  onValueCommit?: (hex: string) => void;
  /** Show the opacity slider and field. */
  alpha?: boolean;
  /** A fixed palette shown under the controls (brand colors, a theme). */
  swatches?: string[];
  /** Colors committed recently, newest first. Controlled with onRecentChange, or kept internally. */
  recent?: string[];
  defaultRecent?: string[];
  onRecentChange?: (recent: string[]) => void;
  recentLimit?: number;
  disabled?: boolean;
};

export function ColorPickerPanel({
  value: valueProp,
  defaultValue = "#6E56CF",
  onValueChange,
  onValueCommit,
  alpha = true,
  swatches,
  recent: recentProp,
  defaultRecent = [],
  onRecentChange,
  recentLimit = 8,
  disabled = false,
  className,
  ...rest
}: ColorPickerPanelProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  const [recent, setRecent] = useControllableState({
    value: recentProp,
    defaultValue: defaultRecent,
    onChange: onRecentChange,
  });

  // HSV is the working model: it remembers hue through grays, which a hex string can't.
  const [hsva, setHsva] = useState(() => toHsva(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value.toUpperCase() !== hsvaHex(hsva)) setHsva(toHsva(value, hsva));
  }

  const [format, setFormat] = useState<Format>("css");
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pulse, setPulse] = useState(0);
  const sessionHasRecent = useRef(false);
  const eyeDropper = useEyeDropperSupport();

  const hex = hsvaHex(hsva);
  const rgb = hsvToRgb(hsva);
  const opaque = cssOf({ ...hsva, a: 1 });

  const current = useRef(hsva);
  current.current = hsva;
  const [error, setError] = useState("");
  const failedWrite = useRef(false);
  const apply = (next: Hsva) => {
    if (disabled) return false;
    const h = hsvaHex(next);
    try {
      setValue(h);
      failedWrite.current = false;
      setError("");
    } catch (error) {
      failedWrite.current = true;
      setError(
        `${String(error)}. Restore edit access or repair the source in Code.`,
      );
      return false;
    }
    current.current = next;
    setHsva(next);
    setSeen(h);
    return true;
  };

  // The first commit of an editing session adds a recent color; later ones update it in place.
  const commit = (
    next: Hsva = current.current,
    { remember = true }: { remember?: boolean } = {},
  ) => {
    if (disabled || failedWrite.current) return;
    const h = hsvaHex(next);
    onValueCommit?.(h);
    if (!remember) return;
    const rest = recent.filter(
      (c, i) => c.toUpperCase() !== h && !(i === 0 && sessionHasRecent.current),
    );
    setRecent([h, ...rest].slice(0, recentLimit));
    sessionHasRecent.current = true;
  };

  const choose = (c: string) => {
    const next = toHsva(c, hsva);
    if (disabled) return;
    try {
      setValue(c);
      failedWrite.current = false;
      setError("");
    } catch (error) {
      setError(String(error));
      return;
    }
    current.current = next;
    setHsva(next);
    setSeen(c);
    commit(next, { remember: false });
    setPulse((p) => p + 1);
  };

  /* Saturation / value area */
  const fromPointer = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      ...current.current,
      s: clamp((e.clientX - r.left) / r.width, 0, 1),
      v: clamp(1 - (e.clientY - r.top) / r.height, 0, 1),
    };
  };
  const areaKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = d[e.key];
    if (!move) return;
    e.preventDefault();
    const next = {
      ...current.current,
      s: clamp(current.current.s + move[0], 0, 1),
      v: clamp(current.current.v + move[1], 0, 1),
    };
    apply(next);
    commit(next);
  };

  const pick = async () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor })
      .EyeDropper;
    if (!Ctor || picking) return;
    setPicking(true);
    try {
      const { sRGBHex } = await new Ctor().open();
      const rgbPicked = parseColor(sRGBHex);
      if (rgbPicked) {
        const next = rgbToHsv(
          { ...rgbPicked, a: current.current.a },
          current.current,
        );
        apply(next);
        commit(next);
        setPulse((p) => p + 1);
      }
    } catch {
      // Escape or a click outside the page cancels the pick; nothing to report.
    } finally {
      setPicking(false);
    }
  };

  return (
    <div
      data-disabled={disabled || undefined}
      className={cn(
        "flex w-64 max-w-[calc(100vw-6rem)] flex-col gap-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...rest}
    >
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {!parseColor(value) && (
        <p role="alert" className="text-xs text-danger">
          Cannot edit this color. Enter a literal color in Code.
        </p>
      )}
      {value.trim().toLowerCase().startsWith("oklch") && (
        <p className="text-xs text-fg-3">
          Preview retains OKLCH. Picker edits convert to sRGB; colors outside
          sRGB are clipped.
        </p>
      )}
      {/* Saturation (x) and brightness (y) for the current hue. */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Saturation and brightness"
        aria-roledescription="2D slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsva.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsva.s * 100)}%, brightness ${Math.round(hsva.v * 100)}%`}
        data-dragging={dragging || undefined}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus({ preventScroll: true });
          setDragging(true);
          apply(fromPointer(e));
        }}
        onPointerMove={(e) => dragging && apply(fromPointer(e))}
        onPointerUp={(e) => {
          if (!dragging) return;
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
          const next = fromPointer(e);
          apply(next);
          commit(next);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={areaKey}
        className="group/area relative h-40 w-full cursor-crosshair touch-none select-none rounded-lg outline-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-3"
        style={{
          background: `linear-gradient(to top, hsl(0 0% 0%), transparent), linear-gradient(to right, hsl(0 0% 100%), hsl(${hsva.h} 100% 50%))`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg)_10%,transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute size-0"
          style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%` }}
        >
          <motion.div
            className={cn(
              "absolute -left-2 -top-2 size-4 rounded-full",
              thumbRing,
            )}
            style={{ backgroundColor: opaque }}
            animate={{ scale: dragging && !reduce ? 1.25 : 1 }}
            transition={spring.snappy}
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {eyeDropper && (
          <button
            type="button"
            onClick={pick}
            aria-label="Pick a color from the screen"
            aria-busy={picking || undefined}
            data-picking={picking || undefined}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-2 bg-raised text-fg-2 outline-none transition-[background-color,border-color,color,scale] duration-150 hover:border-fg-4 hover:text-fg active:scale-[0.92] focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-3 data-[picking]:border-fg-4 data-[picking]:bg-fg/5 data-[picking]:text-fg"
          >
            <PipetteIcon />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <ChannelSlider
            label="Hue"
            max={360}
            value={Math.round(hsva.h)}
            onChange={(h) => apply({ ...current.current, h })}
            onCommit={(h) => commit({ ...current.current, h })}
            valueText={(v) => `${v}°`}
            trackStyle={{
              background:
                "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
            }}
            thumbColor={`hsl(${hsva.h} 100% 50%)`}
            disabled={disabled}
            reduce={!!reduce}
          />
          {alpha && (
            <ChannelSlider
              label="Opacity"
              max={100}
              value={Math.round(hsva.a * 100)}
              onChange={(a) => apply({ ...current.current, a: a / 100 })}
              onCommit={(a) => commit({ ...current.current, a: a / 100 })}
              valueText={(v) => `${v}%`}
              checker
              trackStyle={{
                backgroundImage: `linear-gradient(to right, transparent, ${opaque})`,
              }}
              thumbColor={cssOf(hsva)}
              disabled={disabled}
              reduce={!!reduce}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            setFormat(FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length])
          }
          aria-label={`Color format: ${format.toUpperCase()}. Switch format`}
          className="group/fmt flex h-7 w-[52px] shrink-0 items-center justify-between rounded-md pl-1.5 pr-1 font-mono text-[11px] text-fg-2 outline-none transition-[background-color,color,scale] duration-150 hover:bg-fg/5 hover:text-fg active:scale-[0.95] focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-fg-3"
        >
          <span className="relative grid overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={format}
                className="col-start-1 row-start-1 uppercase"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: ease.out }}
              >
                {format}
              </motion.span>
            </AnimatePresence>
          </span>
          <ChevronsUpDown
            size={12}
            className="text-fg-4 transition-colors group-hover/fmt:text-fg-3"
          />
        </button>

        <div className="flex min-w-0 flex-1 gap-1">
          {format === "css" ? (
            <ColorValueField
              key="css"
              hex={value}
              onApply={(c) => {
                setValue(c);
                failedWrite.current = false;
                setError("");
                setSeen(c);
                const next = toHsva(c, current.current);
                current.current = next;
                setHsva(next);
                commit(next);
              }}
              disabled={disabled}
            />
          ) : format === "rgb" ? (
            <>
              {(["r", "g", "b"] as const).map((k) => (
                <ChannelInput
                  key={k}
                  label={k.toUpperCase()}
                  value={rgb[k]}
                  max={255}
                  onApply={(n) => {
                    const prev = current.current;
                    const next = rgbToHsv({ ...hsvToRgb(prev), [k]: n }, prev);
                    if (!apply(next))
                      throw new Error(
                        "Color was not saved. Restore edit access or repair the source in Code.",
                      );
                    commit(next);
                  }}
                  disabled={disabled}
                />
              ))}
            </>
          ) : (
            (() => {
              const hsl = rgbToHsl(rgb);
              return (["h", "s", "l"] as const).map((k) => (
                <ChannelInput
                  key={k}
                  label={k.toUpperCase()}
                  value={k === "h" ? Math.round(hsva.h) : hsl[k]}
                  max={k === "h" ? 360 : 100}
                  onApply={(n) => {
                    const prev = current.current;
                    const hsl = {
                      ...rgbToHsl(hsvToRgb(prev)),
                      h: prev.h,
                      [k]: n,
                    };
                    const next = rgbToHsv(
                      hslToRgb(hsl.h, hsl.s, hsl.l, prev.a),
                      { ...prev, h: hsl.h },
                    );
                    if (!apply(next))
                      throw new Error(
                        "Color was not saved. Restore edit access or repair the source in Code.",
                      );
                    commit(next);
                  }}
                  disabled={disabled}
                />
              ));
            })()
          )}
          {alpha && (
            <ChannelInput
              label="A"
              suffix="%"
              value={Math.round(hsva.a * 100)}
              max={100}
              onApply={(n) => {
                const next = { ...current.current, a: n / 100 };
                if (!apply(next))
                  throw new Error(
                    "Color was not saved. Restore edit access or repair the source in Code.",
                  );
                commit(next);
              }}
              disabled={disabled}
              className="w-[54px] flex-none"
            />
          )}
        </div>
      </div>

      {(swatches?.length || recent.length > 0) && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-3">
          {swatches?.length ? (
            <SwatchRow
              id={`${uid}-sw`}
              label="Swatches"
              colors={swatches}
              current={hex}
              onChoose={choose}
              reduce={!!reduce}
            />
          ) : null}
          {recent.length > 0 && (
            <SwatchRow
              id={`${uid}-rc`}
              label="Recent"
              colors={recent}
              current={hex}
              onChoose={choose}
              reduce={!!reduce}
              animated
            />
          )}
        </div>
      )}

      {/* Pulse the live value for screen readers only when it settles, not on every drag frame. */}
      <span className="sr-only" role="status" aria-live="polite" key={pulse}>
        {pulse ? `Color set to ${hex}` : ""}
      </span>
    </div>
  );
}

function ChannelSlider({
  label,
  max,
  value,
  onChange,
  onCommit,
  valueText,
  trackStyle,
  thumbColor,
  checker: withChecker,
  disabled,
  reduce,
}: {
  label: string;
  max: number;
  value: number;
  onChange: (n: number) => void;
  onCommit: (n: number) => void;
  valueText: (n: number) => string;
  trackStyle: React.CSSProperties;
  thumbColor: string;
  checker?: boolean;
  disabled?: boolean;
  reduce: boolean;
}) {
  return (
    <Slider.Root
      value={value}
      min={0}
      max={max}
      disabled={disabled}
      thumbAlignment="edge"
      onValueChange={(v) => onChange(v as number)}
      onValueCommitted={(v) => onCommit(v as number)}
      className="group/slider"
    >
      <Slider.Control className="flex h-4 w-full cursor-pointer touch-none select-none items-center">
        <Slider.Track
          className={cn(
            "relative h-3 w-full rounded-full",
            withChecker && checker,
          )}
        >
          <div
            aria-hidden
            className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg)_10%,transparent)]"
            style={trackStyle}
          />
          <Slider.Thumb
            aria-label={label}
            getAriaValueText={(_, v) => valueText(v)}
            className={cn(
              "size-4 rounded-full outline-none",
              thumbRing,
              withChecker && checker,
              "transition-[scale] duration-150 ease-out has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg-3",
              !reduce && "data-[dragging]:scale-125 active:scale-125",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: thumbColor }}
            />
          </Slider.Thumb>
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

// Text and channels commit only settled drafts; drag controls remain continuous.
function ColorValueField({
  hex,
  onApply,
  disabled,
}: {
  hex: string;
  onApply: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <SettledInput
      className="min-w-0 flex-1"
      label="Color value"
      value={hex}
      disabled={disabled}
      validate={(text) =>
        parseColor(text)
          ? undefined
          : "Use #hex, rgb(), hsl(), or oklch(), then press Enter."
      }
      onCommit={onApply}
    />
  );
}

function ChannelInput({
  label,
  value,
  max,
  suffix,
  onApply,
  disabled,
  className,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  onApply: (n: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const names: Record<string, string> = {
    R: "Red",
    G: "Green",
    B: "Blue",
    H: "Hue",
    S: "Saturation",
    L: "Lightness",
    A: "Opacity",
  };
  return (
    <SettledInput
      className={cn("min-w-0 flex-1", className)}
      label={`${names[label] ?? label}${suffix ? ` (${suffix})` : ""}`}
      value={String(value)}
      numeric={{ min: 0, max }}
      disabled={disabled}
      validate={(text) => numberError(text, 0, max)}
      onCommit={(text) => onApply(Number(text))}
    />
  );
}

function SwatchRow({
  id,
  label,
  colors,
  current,
  onChoose,
  reduce,
  animated,
}: {
  id: string;
  label: string;
  colors: string[];
  current: string;
  onChoose: (c: string) => void;
  reduce: boolean;
  animated?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        id={id}
        className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-4"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="grid grid-cols-8 gap-1.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {[...new Set(colors)].map((c) => {
            const up = c.toUpperCase();
            const on = hsvaHex(toHsva(up)) === current;
            return (
              <motion.button
                key={up}
                type="button"
                layout={animated && !reduce ? "position" : false}
                initial={
                  animated && !reduce ? { opacity: 0, scale: 0.6 } : false
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.6,
                  transition: { duration: 0.12 },
                }}
                transition={spring.snappy}
                onClick={() => onChoose(up)}
                aria-label={up}
                aria-pressed={on}
                className={cn(
                  "group/sw relative aspect-square w-full rounded-md outline-none transition-[scale] duration-100 active:scale-[0.9] focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-3",
                  checker,
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg)_12%,transparent)] transition-[scale] duration-150 ease-out group-hover/sw:scale-[1.06]"
                  style={{ background: up }}
                />
                {on && (
                  <motion.span
                    layoutId={reduce ? undefined : `${id}-ring`}
                    aria-hidden
                    className="absolute -inset-[3px] rounded-[8px] border-[1.5px] border-fg"
                    transition={spring.snappy}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ───────────────────────── the popover ───────────────────────── */

export type ColorPickerProps = Omit<ColorPickerPanelProps, "className"> & {
  /** A square swatch, or a field-shaped trigger that also shows the hex. */
  variant?: "swatch" | "field";
  /** Names the trigger for assistive tech, followed by the current value: "Brand color, #6E56CF". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};

export function ColorPicker({
  variant = "swatch",
  label = "Color",
  size = "md",
  className,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  side = "bottom",
  align = "start",
  value: valueProp,
  defaultValue = "#6E56CF",
  onValueChange,
  recent: recentProp,
  defaultRecent = [],
  onRecentChange,
  disabled,
  ...panel
}: ColorPickerProps) {
  const [open, setOpen] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange: onValueChange,
  });
  // Recents live here, above the panel, so they survive the popup unmounting.
  const [recent, setRecent] = useControllableState({
    value: recentProp,
    defaultValue: defaultRecent,
    onChange: onRecentChange,
  });
  const [session, setSession] = useState(0);
  const rgba = parseColor(value);
  const pct = rgba && rgba.a < 1 ? Math.round(rgba.a * 100) : null;
  const shownHex = value;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setSession((s) => s + 1);
        setOpen(next);
      }}
    >
      <Popover.Trigger
        title={value}
        disabled={disabled}
        aria-label={`${label}, ${shownHex}${pct !== null ? ` at ${pct}% opacity` : ""}`}
        data-variant={variant}
        data-size={size}
        className={cn(
          "group/trigger relative inline-flex shrink-0 select-none items-center outline-none",
          "transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out active:duration-75",
          "disabled:pointer-events-none disabled:opacity-50",
          variant === "swatch"
            ? cn(
                "justify-center rounded-lg border border-line-2 bg-raised shadow-[var(--shadow)] hover:border-fg-4 active:scale-[0.94] data-[popup-open]:border-fg-4 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-3",
                size === "sm" ? "size-7" : "size-8",
              )
            : cn(
                "gap-2 rounded-lg border border-line-2 bg-raised pl-1 pr-2 shadow-[var(--shadow)] hover:border-fg-4 active:scale-[0.985] data-[popup-open]:border-fg-4 focus-visible:border-fg-4 focus-visible:ring-3 focus-visible:ring-fg/10",
                size === "sm" ? "h-7 text-[12px]" : "h-8 text-[12.5px]",
              ),
          className,
        )}
      >
        <span
          className={cn(
            "block shrink-0 overflow-hidden",
            checker,
            variant === "swatch"
              ? "absolute inset-[3px] rounded-[5px]"
              : cn(
                  "relative",
                  size === "sm" ? "size-5 rounded-[5px]" : "size-6 rounded-md",
                ),
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg)_12%,transparent)]"
            style={{ background: value }}
          />
        </span>
        {variant === "field" && (
          <>
            <span className="min-w-0 max-w-40 truncate font-mono tabular text-fg">
              {shownHex}
            </span>
            {pct !== null && (
              <span className="font-mono tabular text-fg-3">{pct}%</span>
            )}
            <ChevronDown
              size={14}
              className="ml-auto text-fg-3 transition-transform duration-200 ease-out group-data-[popup-open]/trigger:rotate-180 motion-reduce:transition-none"
            />
          </>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-(--z-popover)"
        >
          <Popover.Popup
            className={cn(
              "origin-(--transform-origin) rounded-xl border border-line-2 bg-raised p-3 shadow-pop outline-none",
              "transition-[opacity,scale] duration-180 ease-out-expo data-starting-style:scale-[0.96] data-starting-style:opacity-0",
              "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-120",
              "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100",
            )}
          >
            <Popover.Title className="sr-only">{label}</Popover.Title>
            <ColorPickerPanel
              key={session}
              {...panel}
              value={value}
              onValueChange={setValue}
              recent={recent}
              onRecentChange={setRecent}
              disabled={disabled}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
