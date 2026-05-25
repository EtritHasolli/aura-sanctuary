import { useEffect, useMemo, useState } from "react";

type WeatherType = "sunny" | "cloudy" | "rain" | "snow" | "storm" | "night" | "foggy";

const WEATHER_CODE_MAP: Record<number, WeatherType> = {
  113: "sunny",
  116: "cloudy", 119: "cloudy", 122: "cloudy",
  143: "foggy", 248: "foggy", 260: "foggy",
  176: "rain", 263: "rain", 266: "rain", 293: "rain", 296: "rain",
  299: "rain", 302: "rain", 305: "rain", 308: "rain",
  311: "rain", 314: "rain", 353: "rain", 356: "rain", 359: "rain",
  362: "rain", 365: "rain",
  179: "snow", 182: "snow", 185: "snow", 227: "snow", 230: "snow",
  281: "snow", 284: "snow", 323: "snow", 326: "snow", 329: "snow",
  332: "snow", 335: "snow", 338: "snow", 350: "snow",
  368: "snow", 371: "snow", 374: "snow", 377: "snow",
  200: "storm", 386: "storm", 389: "storm", 392: "storm", 395: "storm",
};

const RANDOM_POOL: WeatherType[] = ["sunny", "cloudy", "rain", "snow", "storm", "foggy"];

function codeToWeather(code: number, isNight: boolean): WeatherType {
  if (isNight) return "night";
  return WEATHER_CODE_MAP[code] ?? "cloudy";
}

function pickRandom(): WeatherType {
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 21) return "night";
  return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
}

const SKY: Record<WeatherType, string> = {
  sunny:  "linear-gradient(180deg, #3a8fd1 0%, #6bb8f5 100%)",
  cloudy: "linear-gradient(180deg, #7a8fa3 0%, #a0b2c0 100%)",
  rain:   "linear-gradient(180deg, #3a4a5a 0%, #4a5a6a 100%)",
  snow:   "linear-gradient(180deg, #8aa8c0 0%, #c0d4e4 100%)",
  storm:  "linear-gradient(180deg, #1a1f2e 0%, #2d3748 100%)",
  night:  "linear-gradient(180deg, #050c18 0%, #0f1e30 100%)",
  foggy:  "linear-gradient(180deg, #9aacba 0%, #b8c8d4 100%)",
};

const WINDOW_CSS = `
@keyframes sw-rain {
  0%   { transform: translateY(-12%) rotate(8deg); opacity: 0; }
  8%   { opacity: 0.85; }
  92%  { opacity: 0.85; }
  100% { transform: translateY(110%) rotate(8deg); opacity: 0; }
}
@keyframes sw-snow {
  0%   { transform: translateY(-8%) translateX(0); opacity: 0; }
  8%   { opacity: 0.9; }
  92%  { opacity: 0.8; }
  100% { transform: translateY(108%) translateX(14px); opacity: 0; }
}
@keyframes sw-cloud {
  from { transform: translateX(-60px); }
  to   { transform: translateX(calc(100% + 60px)); }
}
@keyframes sw-fog {
  from { transform: translateX(-200px); }
  to   { transform: translateX(200px); }
}
@keyframes sw-sun-glow {
  0%, 100% { box-shadow: 0 0 6px 2px rgba(255,215,0,0.45); }
  50%       { box-shadow: 0 0 14px 5px rgba(255,215,0,0.70); }
}
@keyframes sw-star {
  0%, 100% { opacity: 0.9; }
  50%       { opacity: 0.15; }
}
@keyframes sw-lightning {
  0%, 80%, 100% { opacity: 0; }
  82%            { opacity: 0.6; }
  84%            { opacity: 0; }
  86%            { opacity: 0.4; }
}
`;

/* ── sub-scene elements ── */

function Sun() {
  return (
    <div style={{ position: "absolute", top: "12%", right: "14%", width: "22%", paddingBottom: "22%", borderRadius: "50%", background: "#ffd700", animation: "sw-sun-glow 3s ease-in-out infinite" }} />
  );
}

function CloudRow({ top, width, duration, delay, color }: { top: string; width: string; duration: number; delay: number; color: string }) {
  return (
    <div style={{
      position: "absolute", top, left: 0,
      width, height: "28%",
      background: color,
      borderRadius: "40% 40% 30% 30%",
      filter: "blur(1.5px)",
      animation: `sw-cloud ${duration}s linear ${delay}s infinite`,
    }} />
  );
}

function RainDrop({ left, duration, delay }: { left: string; duration: number; delay: number }) {
  return (
    <div style={{
      position: "absolute",
      left, top: 0,
      width: "1px", height: "13%",
      background: "rgba(160,200,240,0.75)",
      animation: `sw-rain ${duration}s linear ${delay}s infinite`,
    }} />
  );
}

function SnowFlake({ left, top, size, duration, delay }: { left: string; top: string; size: number; duration: number; delay: number }) {
  return (
    <div style={{
      position: "absolute",
      left, top,
      width: size, height: size,
      borderRadius: "50%",
      background: "rgba(220,240,255,0.9)",
      animation: `sw-snow ${duration}s linear ${delay}s infinite`,
    }} />
  );
}

function Star({ left, top, size, duration, delay }: { left: string; top: string; size: number; duration: number; delay: number }) {
  return (
    <div style={{
      position: "absolute",
      left, top,
      width: size, height: size,
      borderRadius: "50%",
      background: "#fff",
      animation: `sw-star ${duration}s ease-in-out ${delay}s infinite`,
    }} />
  );
}

function Moon() {
  return (
    <div style={{ position: "absolute", top: "10%", right: "12%", width: "20%", paddingBottom: "20%", borderRadius: "50%", background: "#e8dcc8", boxShadow: "-4px 2px 0 3px #050c18" }} />
  );
}

function FogStrip({ top, duration, delay }: { top: string; duration: number; delay: number }) {
  return (
    <div style={{
      position: "absolute", top, left: 0,
      width: "120%", height: "30%",
      background: "rgba(190,205,215,0.35)",
      filter: "blur(4px)",
      animation: `sw-fog ${duration}s ease-in-out ${delay}s infinite alternate`,
    }} />
  );
}

/* ── scene compositor ── */

function Scene({ weather }: { weather: WeatherType }) {
  const rainDrops = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      left: `${(i / 28) * 108 - 4}%`,
      duration: 0.45 + (i % 5) * 0.07,
      delay: (i * 0.11) % 0.9,
    })), []);

  const snowFlakes = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      left: `${(i / 22) * 100}%`,
      top: `-${4 + (i % 3) * 2}%`,
      size: i % 3 === 0 ? 2 : 1,
      duration: 1.6 + (i % 7) * 0.25,
      delay: (i * 0.18) % 2.2,
    })), []);

  const stars = useMemo(() =>
    Array.from({ length: 26 }, (_, i) => ({
      left: `${(i * 37 + 11) % 100}%`,
      top: `${(i * 53 + 7) % 78}%`,
      size: i % 4 === 0 ? 2 : 1,
      duration: 1.2 + (i % 5) * 0.4,
      delay: (i * 0.23) % 2.5,
    })), []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: SKY[weather] }}>
      {/* sunny */}
      {weather === "sunny" && (
        <>
          <Sun />
          <CloudRow top="15%" width="35%" duration={14} delay={0}  color="rgba(255,255,255,0.78)" />
          <CloudRow top="48%" width="22%" duration={18} delay={-6} color="rgba(255,255,255,0.55)" />
        </>
      )}

      {/* cloudy */}
      {weather === "cloudy" && (
        <>
          <CloudRow top="10%" width="42%" duration={13} delay={0}  color="rgba(210,218,226,0.85)" />
          <CloudRow top="38%" width="30%" duration={17} delay={-5} color="rgba(195,205,215,0.80)" />
          <CloudRow top="62%" width="38%" duration={15} delay={-9} color="rgba(200,210,220,0.70)" />
        </>
      )}

      {/* rain */}
      {weather === "rain" && (
        <>
          <CloudRow top="5%"  width="50%" duration={10} delay={0}  color="rgba(80,90,110,0.9)" />
          <CloudRow top="30%" width="40%" duration={13} delay={-4} color="rgba(70,80,100,0.85)" />
          {rainDrops.map((d, i) => <RainDrop key={i} {...d} />)}
        </>
      )}

      {/* snow */}
      {weather === "snow" && (
        <>
          <CloudRow top="5%"  width="45%" duration={12} delay={0}  color="rgba(195,210,228,0.80)" />
          <CloudRow top="35%" width="32%" duration={16} delay={-5} color="rgba(185,200,220,0.70)" />
          {snowFlakes.map((s, i) => <SnowFlake key={i} {...s} />)}
        </>
      )}

      {/* storm */}
      {weather === "storm" && (
        <>
          <CloudRow top="0%"  width="55%" duration={8}  delay={0}  color="rgba(30,35,50,0.95)" />
          <CloudRow top="28%" width="48%" duration={10} delay={-3} color="rgba(25,30,45,0.90)" />
          {rainDrops.map((d, i) => (
            <RainDrop key={i} left={d.left} duration={d.duration * 0.75} delay={d.delay} />
          ))}
          <div style={{ position: "absolute", inset: 0, background: "rgba(200,210,255,0.12)", animation: "sw-lightning 5s ease-in-out infinite" }} />
        </>
      )}

      {/* night */}
      {weather === "night" && (
        <>
          {stars.map((s, i) => <Star key={i} {...s} />)}
          <Moon />
        </>
      )}

      {/* foggy */}
      {weather === "foggy" && (
        <>
          <CloudRow top="8%"  width="40%" duration={14} delay={0}  color="rgba(185,198,210,0.70)" />
          <FogStrip top="20%" duration={9}  delay={0} />
          <FogStrip top="50%" duration={12} delay={-4} />
          <FogStrip top="72%" duration={10} delay={-7} />
        </>
      )}
    </div>
  );
}

/* ── main export ── */

export function SanctuaryWindow() {
  const [weather, setWeather] = useState<WeatherType | null>(null);

  useEffect(() => {
    const fallback = () => setWeather(pickRandom());

    if (!("geolocation" in navigator)) { fallback(); return; }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://wttr.in/${coords.latitude},${coords.longitude}?format=j1`,
            { signal: AbortSignal.timeout(6000) }
          );
          const data = await res.json();
          const code = Number(data.current_condition[0].weatherCode);
          const hour = new Date().getHours();
          setWeather(codeToWeather(code, hour < 6 || hour >= 21));
        } catch {
          fallback();
        }
      },
      fallback,
      { timeout: 5000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);

  if (!weather) return null;

  return (
    <>
      <style>{WINDOW_CSS}</style>

      {/* Window centered on the wall, slightly lower */}
      <div
        className="absolute pointer-events-none"
        style={{ left: "50%", transform: "translateX(-50%)", top: "15%", width: "32%", aspectRatio: "5/4" }}
      >
        {/* scene fills the pane area */}
        <div style={{ position: "absolute", inset: "4px 4px 10px 4px", overflow: "hidden" }}>
          <Scene weather={weather} />
        </div>

        {/* outer frame */}
        <div style={{
          position: "absolute", inset: 0,
          border: "4px solid #2a2018",
          boxShadow: "inset 0 0 0 1px #4a3828, 2px 3px 0 #0a0806",
          zIndex: 2,
          pointerEvents: "none",
        }} />

        {/* cross dividers (2×2 panes) */}
        <div style={{ position: "absolute", inset: "4px 4px 10px 4px", zIndex: 3, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: "3px", background: "#2a2018", transform: "translateX(-50%)" }} />
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "3px", background: "#2a2018", transform: "translateY(-50%)" }} />
        </div>

        {/* glass tint / reflection */}
        <div style={{
          position: "absolute", inset: "4px 4px 10px 4px",
          background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)",
          zIndex: 4, pointerEvents: "none",
        }} />

        {/* sill */}
        <div style={{
          position: "absolute", bottom: 0, left: "-4px", right: "-4px",
          height: "10px", background: "#2a2018",
          boxShadow: "0 3px 0 #0a0806",
          zIndex: 5,
        }} />
      </div>
    </>
  );
}
