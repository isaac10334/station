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
export function WeatherWidget() {
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
  return <div className="weather-widget" data-weather={forecast ? current.tone : "preview"}>
    <div className="weather-orb" aria-hidden="true"><current.Icon size={72} strokeWidth={1.25} /></div>
    <div className="weather-main"><span className="weather-location"><LocateFixed size={14} /> {forecast ? "Current location" : "Your local forecast"}</span>
      {forecast ? <><div className="weather-temperature">{forecast.temperature}<span>°C</span></div><strong>{current.label}</strong><small>{forecast.isDay ? "Daytime" : "Nighttime"} · Open-Meteo</small></>
        : <><strong className="weather-intro">A little atmosphere for your workspace.</strong><small>See the next six hours where you are.</small>
          <button type="button" className="weather-locate" onClick={locate} disabled={status === "loading"}><LocateFixed size={14} /> {status === "loading" ? "Finding forecast…" : "Use my location"}</button></>}
      {status === "error" && <p className="weather-error" role="alert">{error} <button type="button" onClick={locate}>Try again</button></p>}
    </div>
    {forecast && <div className="weather-hours" aria-label="Next six hours">{forecast.hours.map((hour) => {
      const { Icon } = condition(hour.code);
      return <div key={hour.time}><time>{hour.time.slice(11, 16)}</time><Icon size={19} strokeWidth={1.7} /><strong>{hour.temperature}°</strong></div>;
    })}</div>}
  </div>;
}
