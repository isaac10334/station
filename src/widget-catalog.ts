import { Activity, Clock3, CloudSun, Layers3, ShieldCheck } from "lucide-react";
import type { WidgetId } from "./panel-layout";

/** Reusable app renderer definitions; no per-instance state or guest authority. */
export const WIDGET_CATALOG = {
  weather: { title: "Weather", description: "A six-hour forecast, with location requested when you choose.", icon: CloudSun, renderer: "react", preview: "Forecast · temperature · next six hours" },
  clock: { title: "Local time", description: "Your time, date and time zone, always in sync.", icon: Clock3, renderer: "react", preview: "12:34 · Wednesday · local time" },
  capabilities: { title: "Capability inspector", description: "Inspect and change the selected Component’s explicit grants.", icon: ShieldCheck, renderer: "react", preview: "Logging · feed · text surface · clock" },
  // Serialized `stack` identity is retained. Its renderer is now a real Layout.
  stack: { title: "Layout", description: "Arrange real child widgets in split slots, tabs or a horizontal carousel.", icon: Layers3, renderer: "layout", preview: "Resizable slots · tabs · carousel" },
  snake: { title: "Snake", description: "A keyboard game. Focus the game to play.", icon: Activity, renderer: "react", preview: "Arrow keys · score · restart" },
} satisfies Record<WidgetId, { title: string; description: string; icon: typeof Activity; renderer: string; preview: string }>;
