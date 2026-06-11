import React, { useEffect, useMemo, useState } from 'react';
import { Moon, Waves } from 'lucide-react';

function getMoonPhase(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let c = 0, e = 0, jd = 0, b = 0;

  if (month < 3) {
    c = year - 1;
    e = month + 12;
  } else {
    c = year;
    e = month;
  }

  jd = Math.floor(365.25 * (c + 4716)) + Math.floor(30.6001 * (e + 1)) + day - 1524.5;
  b = 2 - Math.floor(c / 100) + Math.floor(c / 400);
  jd += b;

  const daysSinceNew = (jd - 2451550.1) % 29.530588853;
  const normalized = daysSinceNew < 0 ? daysSinceNew + 29.530588853 : daysSinceNew;
  const phase = normalized / 29.530588853;

  return { age: Math.round(normalized * 10) / 10, phase };
}

function moonPhaseName(phase) {
  if (phase < 0.0625) return { name: 'Lua Nova', icon: '🌑', fishing: 'Excelente' };
  if (phase < 0.1875) return { name: 'Crescente inicial', icon: '🌒', fishing: 'Boa' };
  if (phase < 0.3125) return { name: 'Quarto crescente', icon: '🌓', fishing: 'Regular' };
  if (phase < 0.4375) return { name: 'Crescente gibosa', icon: '🌔', fishing: 'Regular' };
  if (phase < 0.5625) return { name: 'Lua Cheia', icon: '🌕', fishing: 'Excelente' };
  if (phase < 0.6875) return { name: 'Minguante gibosa', icon: '🌖', fishing: 'Boa' };
  if (phase < 0.8125) return { name: 'Quarto minguante', icon: '🌗', fishing: 'Regular' };
  if (phase < 0.9375) return { name: 'Minguante final', icon: '🌘', fishing: 'Boa' };
  return { name: 'Lua Nova', icon: '🌑', fishing: 'Excelente' };
}

function estimateTides(moonPhase, hour) {
  const springFactor = Math.cos(moonPhase * Math.PI * 2);
  const amplitude = 0.4 + Math.abs(springFactor) * 0.3;

  const tideValue = Math.sin((hour / 24) * Math.PI * 2 - Math.PI / 4) * amplitude;

  return {
    level: Math.round(tideValue * 100) / 100,
    amplitude: Math.round(amplitude * 100) / 100,
    type: springFactor > 0.5 ? 'sizígia' : springFactor < -0.5 ? 'quadratura' : 'intermediária'
  };
}

function getForecast(baseDate) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const moon = getMoonPhase(d);
    const info = moonPhaseName(moon.phase);
    const currentHour = i === 0 ? new Date().getHours() : 12;
    const tide = estimateTides(moon.phase, currentHour);
    days.push({
      date: d,
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      moon: info,
      moonAge: moon.age,
      tide
    });
  }
  return days;
}

async function fetchMarineData() {
  const params = [
    'latitude=-34.735',
    'longitude=-56.275',
    'daily=wave_height_max,wave_period_max,swell_wave_height_max',
    'timezone=America/Montevideo',
    'forecast_days=7'
  ].join('&');

  const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const d = data.daily;
  if (!d) return null;

  return (d.time || []).map((t, i) => ({
    date: t,
    waveHeight: d.wave_height_max?.[i] ?? null,
    wavePeriod: d.wave_period_max?.[i] ?? null,
    swellHeight: d.swell_wave_height_max?.[i] ?? null
  }));
}

export default function LunarTides() {
  const forecast = useMemo(() => getForecast(new Date()), []);
  const today = forecast[0];
  const [marine, setMarine] = useState(null);

  useEffect(() => {
    fetchMarineData().then(setMarine).catch(() => {});
  }, []);

  const merged = useMemo(() => {
    return forecast.map((day) => {
      const dateStr = day.date.toISOString().slice(0, 10);
      const m = marine?.find((r) => r.date === dateStr);
      return { ...day, marine: m || null };
    });
  }, [forecast, marine]);

  const todayMerged = merged[0];

  return (
    <div className="lunar-tides">
      <div className="lt-today">
        <span className="lt-moon-icon">{todayMerged.moon.icon}</span>
        <div className="lt-today-info">
          <strong>{todayMerged.moon.name}</strong>
          <span>Dia lunar: {todayMerged.moonAge} · Pesca: <strong className={`lt-fishing lt-fishing-${todayMerged.moon.fishing.toLowerCase()}`}>{todayMerged.moon.fishing}</strong></span>
          <span>Maré: {todayMerged.tide.type} · amplitude {todayMerged.tide.amplitude}m</span>
          {todayMerged.marine && (
            <span className="lt-marine"><Waves size={11} /> Ondas: {todayMerged.marine.waveHeight}m · período {todayMerged.marine.wavePeriod}s{todayMerged.marine.swellHeight != null ? ` · swell ${todayMerged.marine.swellHeight}m` : ''}</span>
          )}
        </div>
      </div>

      <div className="lt-forecast">
        {merged.map((day, i) => (
          <div key={i} className={`lt-day${i === 0 ? ' today' : ''}`}>
            <span className="lt-day-label">{day.label}</span>
            <span className="lt-day-moon">{day.moon.icon}</span>
            <span className={`lt-day-fishing lt-fishing-${day.moon.fishing.toLowerCase()}`}>{day.moon.fishing === 'Excelente' ? '★★★' : day.moon.fishing === 'Boa' ? '★★' : '★'}</span>
            <span className="lt-day-tide">{day.tide.type.slice(0, 3)}</span>
            {day.marine && <span className="lt-day-wave">🌊{day.marine.waveHeight}m</span>}
          </div>
        ))}
      </div>

      <p className="lt-note">Lua nova e cheia = marés de sizígia (maiores) = melhor pesca. {marine ? 'Dados marinhos via Open-Meteo Marine API.' : 'Estimativa baseada em ciclo lunar de 29.5 dias.'}</p>
    </div>
  );
}
