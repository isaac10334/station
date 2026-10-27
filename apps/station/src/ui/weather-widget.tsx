import { BUILTIN_AUTHORED_SURFACES, type AuthoredSurface } from "../core/authored-surface";
import { AdaptiveWidgetSurface } from "./components/workspace/adaptive-widget-surface";
import { AuthoredSurfaceView } from "./components/workspace/authored-surface";
import { useEffect, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, LocateFixed, Snowflake, Sun } from "lucide-react";

type Forecast = { temperature: number; code: number; isDay: boolean; hours: { time: string; temperature: number; code: number }[] };

function condition(code: number) {
  if (code === 0) return { label: "Clear sky", Icon: Sun, tone: "sun" };
  if (code <= 2) return { label: "Partly cloudy", Icon: CloudSun, tone: "cloud" };
  if (code === 3) return { label: "Overcast", Icon: Cloud, tone: "cloud" };
  if (code <= 48) return { label: "Foggy", Icon: CloudFog, tone: "cloud" };
  if (code <= 67 || code >= 80 && code <= 82) return { label: "Rain", Icon: CloudRain, tone: "rain" };
  if (code <= 86) return { label: "Snow", Icon: Snowflake, tone: "snow" };
  return { label: "Thunderstorm", Icon: CloudLightning, tone: "storm" };
}

/** Location is requested only on a user action; no implicit IP lookup or fallback city. */
export function WeatherWidget({ surface = BUILTIN_AUTHORED_SURFACES.weather }: { surface?: AuthoredSurface }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!coordinates) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ latitude: String(coordinates.latitude), longitude: String(coordinates.longitude),
      current: "temperature_2m,weather_code,is_day", hourly: "temperature_2m,weather_code", forecast_hours: "6", timezone: "auto" });
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Weather service unavailable"); return response.json(); })
      .then((data) => {
        if (!Array.isArray(data.hourly?.time) || typeof data.current?.temperature_2m !== "number") throw new Error("Weather data unavailable");
        setForecast({ temperature: Math.round(data.current.temperature_2m), code: data.current.weather_code, isDay: data.current.is_day === 1,
          hours: data.hourly.time.slice(0, 6).map((time: string, index: number) => ({ time, temperature: Math.round(data.hourly.temperature_2m[index]), code: data.hourly.weather_code[index] })) });
        setStatus("ready");
      }).catch((reason) => { if (reason.name !== "AbortError") { setError(reason.message || "Weather unavailable"); setStatus("error"); } });
    return () => controller.abort();
  }, [coordinates]);

  function locate() {
    if (!navigator.geolocation) { setError("Location is unavailable in this browser."); setStatus("error"); return; }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition((position) => setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => { setError("Location was not shared. Check browser permissions and try again."); setStatus("error"); }, { timeout: 10000 });
  }
  const current = condition(forecast?.code ?? 1);
  return <AdaptiveWidgetSurface><AuthoredSurfaceView surface={surface} inputs={{
    temperature: forecast ? `${forecast.temperature} °C` : "—",
    condition: forecast ? `${current.label} · ${forecast.isDay ? "Daytime" : "Nighttime"} · Open-Meteo` : "See the next six hours where you are.",
    hours: forecast?.hours.map(hour => `${hour.time.slice(11,16)}  ${hour.temperature}°  ${condition(hour.code).label}`).join("\n") ?? "",
    error, loading: status === "loading",
  }} actions={{ locate }} /></AdaptiveWidgetSurface>;
}
