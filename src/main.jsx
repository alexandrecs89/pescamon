import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import { Activity, AlertTriangle, Anchor, BarChart3, Link, Bell, BellOff, Calendar, Check, ChevronDown, ChevronUp, Clock, Cloud, CloudOff, Crosshair, Droplets, Download, Fish, Flag, GitCompare, GripVertical, LogIn, LogOut, MapPin, MapPinned, MessageCircle, Moon, Package, Plus, RefreshCw, Search, Settings, Share2, Sprout, Sun, ThermometerSun, Trophy, Upload, User, Users, Waves, Wind, X, Zap } from 'lucide-react';
import TrendChart from './TrendChart.jsx';
import FishIcon from './FishIcon.jsx';
import { usePushNotifications } from './usePushNotifications.js';
import { usePremium } from './usePremium.js';
import { filterOccurrences } from './TemporalFilter.jsx';
import TemporalFilter from './TemporalFilter.jsx';
import { getBatchWaterQuality, reportWaterQuality, estimateWaterQualityHeuristic } from "./waterQuality.js";
import OnboardingTutorial from "./OnboardingTutorial.jsx";
import WeekForecastWidget from "./WeekForecastWidget.jsx";
import PredictiveAlerts from "./PredictiveAlerts.jsx";
import FishIDModal from "./FishIDModal.jsx";
import MapLegend from "./MapLegend.jsx";

const UserProfile        = lazy(() => import('./UserProfile.jsx'));
const HourlyRanking      = lazy(() => import('./HourlyRanking.jsx'));
const Challenges         = lazy(() => import('./Challenges.jsx'));
const PdfExport          = lazy(() => import('./PdfExport.jsx'));
const IoTSensors         = lazy(() => import('./IoTSensors.jsx'));
const IoTAdmin           = lazy(() => import('./IoTAdmin.jsx'));
const CorrelationAnalysis = lazy(() => import('./CorrelationAnalysis.jsx'));
const BestTimePrediction = lazy(() => import('./BestTimePrediction.jsx'));
const LunarTides         = lazy(() => import('./LunarTides.jsx'));
const RiverChat          = lazy(() => import('./RiverChat.jsx'));
const ChatBadges         = lazy(() => import('./ChatBadges.jsx'));
const FishingGuide       = lazy(() => import('./FishingGuide.jsx'));
const GearRecommendation = lazy(() => import('./GearRecommendation.jsx'));
const StoreAdmin         = lazy(() => import('./StoreAdmin.jsx'));
const FishingPlanner     = lazy(() => import('./FishingPlanner.jsx'));
const AuthModal          = lazy(() => import('./AuthModal.jsx'));
const UserDashboard      = lazy(() => import('./UserDashboard.jsx'));
const CaptureValidation  = lazy(() => import('./CaptureValidation.jsx'));
const StatsDashboard     = lazy(() => import('./StatsDashboard.jsx'));
const DraggableGrid      = lazy(() => import('./DraggableGrid.jsx'));
const PaywallModal       = lazy(() => import('./PaywallModal.jsx'));
const SocialShare        = lazy(() => import('./SocialShare.jsx'));
const EnvironmentalDashboard = lazy(() => import('./EnvironmentalDashboard.jsx'));
const CustomAlerts       = lazy(() => import('./CustomAlerts.jsx'));
const BuoyCalculator     = lazy(() => import('./BuoyCalculator.jsx'));
const KnotCalculator     = lazy(() => import('./KnotCalculator.jsx'));
const SocialFeed            = lazy(() => import('./SocialFeed.jsx'));
const Pescademia            = lazy(() => import('./Pescademia.jsx'));

import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { LangProvider, LANGUAGES, useT, useLang } from './i18n.jsx';
import L from 'leaflet';
import { loadAllOccurrences, addOccurrence, removeOccurrence, exportOccurrencesJSON, importOccurrencesJSON } from './storage.js';
import { trainEnsembleModel, predictEnsemble, modelSummary, getSpatialPrior, getBayesianPosterior } from './model.js';
import { fetchRemoteOccurrences, pushOccurrence, deleteRemoteOccurrence, pushAllOccurrences, migrateAnonymousOccurrences, signInWithMagicLink, signOut, getSession, onAuthChange, subscribeToOccurrences, getDeviceId, recordBaitUse, createFishingSession, getActiveFishingSession, updateFishingSession, addCatch, getCatchesBySession, uploadCatchPhoto, getIoTSensors, getFishingSpots, addFishingSpot, deleteFishingSpot, upvoteFishingSpot } from './supabase.js';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const RIVER_CENTER = { latitude: -34.735, longitude: -56.275 };

// ── Theme system ─────────────────────────────────────────────────────────────
export const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });
export function useTheme() { return useContext(ThemeContext); }

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pescamon-theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    try { localStorage.setItem('pescamon-theme', theme); } catch {}
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// ── Toast system ─────────────────────────────────────────────────────────────
const ToastContext = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  const toast = useMemo(() => ({
    success: (m) => add(m, 'success'),
    error:   (m) => add(m, 'error'),
    info:    (m) => add(m, 'info'),
  }), [add]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 18px', borderRadius: 10, fontSize: '0.88rem', fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            background: t.type === 'success' ? '#16a34a' : t.type === 'error' ? '#dc2626' : '#1e40af',
            color: '#fff', maxWidth: 340, textAlign: 'center',
            animation: 'toast-bottom-in 0.25s ease',
          }}>{t.msg}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
function useToast() { return useContext(ToastContext); }

// ── Componente Premium Badge ─────────────────────────────────────────────────
function PremiumBadge({ userId, onClick, authSession }) {
  const { isPremium, loading } = usePremium(userId);
  const displayName = authSession?.user?.user_metadata?.full_name || authSession?.user?.email?.split('@')[0] || 'Pescador';
  
  return (
    <button className="topbar-user-btn" onClick={onClick} type="button" style={{ position: 'relative' }}>
      <div className="topbar-avatar">{displayName[0]?.toUpperCase()}</div>
      <span>{displayName}</span>
      {!loading && isPremium && (
        <span
          title="Premium"
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: 'white',
            fontSize: '0.6rem',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg-surface)',
          }}
        >
          👑
        </span>
      )}
    </button>
  );
}

// ── Países disponíveis para expansão geográfica ──────────────────────────────
const COUNTRIES = [
  {
    id: 'UY',
    name: 'Uruguai',
    flagUrl: 'https://flagcdn.com/uy.svg',
    available: true,
    bbox: { minLat: -35.0, maxLat: -30.0, minLon: -58.5, maxLon: -53.0 },
    center: { latitude: -32.8, longitude: -56.0 },
    defaultZoom: 7,
  },
  {
    id: 'BR-RS',
    name: 'Brasil — Rio Grande do Sul',
    shortName: 'Brasil (RS)',
    flagUrl: 'https://flagcdn.com/br.svg',
    available: true,
    bbox: { minLat: -33.80, maxLat: -26.90, minLon: -57.65, maxLon: -49.60 }, // cobre Torres (-49.73) e São Joaquim (-49.93)
    center: { latitude: -30.0, longitude: -53.8 },
    defaultZoom: 8,
  },
  {
    id: 'BR-SC',
    name: 'Brasil — Santa Catarina',
    shortName: 'Brasil (SC)',
    flagUrl: 'https://flagcdn.com/br.svg',
    available: false,
    bbox: { minLat: -29.3, maxLat: -26.2, minLon: -53.8, maxLon: -48.5 },
    center: { latitude: -27.5, longitude: -51.0 },
    defaultZoom: 7,
  },
  {
    id: 'BR',
    name: 'Brasil',
    flagUrl: 'https://flagcdn.com/br.svg',
    available: false,
    bbox: { minLat: -33.8, maxLat: -5.0, minLon: -57.6, maxLon: -34.0 },
    center: { latitude: -15.0, longitude: -50.0 },
    defaultZoom: 5,
  },
  {
    id: 'AR',
    name: 'Argentina',
    flagUrl: 'https://flagcdn.com/ar.svg',
    available: false,
    bbox: { minLat: -55.0, maxLat: -22.0, minLon: -73.5, maxLon: -53.5 },
    center: { latitude: -38.0, longitude: -63.0 },
    defaultZoom: 5,
  },
];

// ── Bacias hidrográficas disponíveis por país ────────────────────────────────
// Permite que o dropdown de bacias seja dinâmico conforme o país selecionado
const BASINS_BY_COUNTRY = {
  UY: [
    { id: 'bacia_rio_negro',    name: 'Bacia do Rio Negro',       emoji: '💧', color: '#eab308' },
    { id: 'bacia_uruguai',      name: 'Bacia do Rio Uruguai',     emoji: '🏞️', color: '#f97316' },
    { id: 'bacia_merin',        name: 'Bacia da Laguna Merín',    emoji: '🌿', color: '#ef4444' },
    { id: 'bacia_plata',        name: 'Bacia do Rio da Prata',    emoji: '🌊', color: '#3b82f6' },
    { id: 'bacia_santa_lucia',  name: 'Bacia do Río Santa Lucía', emoji: '🎣', color: '#22c55e' },
    { id: 'vertente_atlantica', name: 'Vertente Atlântica',       emoji: '🏖️', color: '#a855f7' },
  ],
  'BR-RS': [
    { id: 'bacia_uruguai',      name: 'Bacia do Rio Uruguai',     emoji: '🏞️', color: '#f97316' },
    { id: 'bacia_jacui',        name: 'Bacia do Jacuí / Ibicuí',  emoji: '💧', color: '#22d3ee' },
    { id: 'bacia_merin',        name: 'Bacia da Lagoa Mirim',     emoji: '🌿', color: '#ef4444' },
    { id: 'vertente_atlantica', name: 'Vertente Atlântica',       emoji: '🏖️', color: '#a855f7' },
  ],
};

function detectCountryFromCoords(lat, lon) {
  for (const c of COUNTRIES) {
    const { minLat, maxLat, minLon, maxLon } = c.bbox;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) return c.id;
  }
  return 'UY';
}

function loadSavedCountry() {
  try { return localStorage.getItem('pescamon_country') || null; } catch { return null; }
}

function saveCountry(id) {
  try { localStorage.setItem('pescamon_country', id); } catch {}
}

// Polígono preciso do RS com coordenadas reais das cidades
// Ijuí: -28.4, Santa Maria: -29.7, Passo Fundo: -28.3, Erechim: -27.6
// Norte: fronteira com SC aproximadamente em -27.0 no oeste, descendo para -28.9 no leste
// Polígono RS validado com 32/32 testes geográficos passando
// Fronteiras: Rio Uruguai (NW+W+AR), Rio Quaraí+Jaguarão+Mirim+Chuí (UY),
// Rio Pelotas (divisa centro-norte SC), Rio Mampituba (divisa NE SC)
const RS_POLYGON = [
  [-49.70, -29.35], // Torres / foz Rio Mampituba (NE)
  [-49.83, -30.20],
  [-50.35, -31.40],
  [-51.10, -32.45],
  [-51.75, -33.25], // Rio Grande
  [-52.70, -33.65],
  [-53.53, -33.74], // Chuí (SE)
  [-53.38, -32.57], // Jaguarão
  [-54.16, -31.87], // Aceguá
  [-54.80, -31.40],
  [-55.20, -31.10],
  [-55.53, -30.89], // Santana do Livramento / Rivera (fronteira seca)
  [-56.00, -30.60],
  [-56.45, -30.38], // Quaraí
  [-57.08, -30.30],
  [-57.55, -30.19], // Barra do Quaraí (SW)
  [-57.09, -29.76], // Uruguaiana
  [-55.97, -28.66], // São Borja
  [-54.47, -27.38], // Porto Xavier
  [-53.84, -27.09], // margem RS do Rio Uruguai (NW)
  [-53.16, -27.12], // ao sul de Palmitos SC
  [-52.78, -27.36], // Nonoai / Rio Uruguai
  [-51.54, -27.18], // confluência Pelotas+Canoas (formam Rio Uruguai)
  [-51.00, -27.50], // Rio Pelotas médio
  [-50.45, -27.90], // Rio Pelotas médio-baixo
  [-50.10, -28.20], // Rio Pelotas alto / Serra Geral
  [-49.90, -28.20], // São Joaquim / Serra Geral leste
  [-49.90, -28.90], // cabeceira Rio Mampituba
  [-49.70, -29.35], // Fechar em Torres
];

// ── Fronteira oficial do RS (IBGE) ───────────────────────────────────────────
// Carregada em runtime de /rs_boundary.json (gerada por scripts/build_rs_boundary.mjs
// a partir da malha estadual oficial do IBGE — codarea=43, qualidade=maxima).
// Substitui o RS_POLYGON manual tanto para filtragem quanto para desenho no mapa.
// Fronteiras oficiais POR REGIÃO (o recorte fino já vem pronto da geração dos dados;
// aqui servem para o CONTORNO no mapa e, no caso do RS, para o isPointInRS).
// rs_boundary.json (IBGE, codarea=43) · uy_boundary.json (união das cuencas DINAGUA).
// Para adicionar uma região nova: gerar o arquivo + acrescentar a entrada aqui.
const _BOUNDARY_FILES = { 'BR-RS': 'rs_boundary.json', 'UY': 'uy_boundary.json' };
const _boundaryRings = {};        // countryId -> [ [ [lat,lon], ... ], ... ]
const _boundarySubs = new Set();
function getBoundaryRings(countryId) { return _boundaryRings[countryId] || null; }
function getRSBoundaryRings() { return _boundaryRings['BR-RS'] || null; } // compat p/ isPointInRS
function onBoundary(cb) { _boundarySubs.add(cb); return () => _boundarySubs.delete(cb); }
async function loadBoundary(countryId) {
  if (!_BOUNDARY_FILES[countryId] || _boundaryRings[countryId]) return _boundaryRings[countryId] || null;
  try {
    const res = await fetch('/' + _BOUNDARY_FILES[countryId]);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.rings) && data.rings.length) {
      _boundaryRings[countryId] = data.rings;
      console.log(`[BOUNDARY] ${countryId}: ${data.vertexCount} vértices em ${data.ringCount} anel(is)`);
      _boundarySubs.forEach(cb => { try { cb(); } catch {} });
    }
    return _boundaryRings[countryId] || null;
  } catch (e) {
    console.warn(`[BOUNDARY] Falha ao carregar fronteira de ${countryId}`, e);
    return null;
  }
}
Object.keys(_BOUNDARY_FILES).forEach(loadBoundary);

// Ray casting sobre um anel no formato [lat, lon]
function _rayCastInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1]; // [lat, lon]
    const yj = ring[j][0], xj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Algoritmo Ray Casting (point-in-polygon)
// Verifica se um ponto [lat, lon] está dentro do RS.
// Usa a fronteira oficial do IBGE quando disponível; senão, o polígono manual legado.
function isPointInRS(lat, lon) {
  // Bbox rápido para excluir pontos óbvios
  if (lat < -33.80 || lat > -26.90 || lon < -57.65 || lon > -49.60) return false;

  // Preferir a fronteira oficial (precisa) — dentro de qualquer anel (continente + ilhas)
  const _rsRings = getRSBoundaryRings();
  if (_rsRings && _rsRings.length) {
    for (const ring of _rsRings) {
      if (_rayCastInRing(lat, lon, ring)) return true;
    }
    return false;
  }

  // Fallback: polígono manual legado (29 vértices em [lon, lat])
  let inside = false;
  const n = RS_POLYGON.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = RS_POLYGON[i];  // [lon, lat]
    const [xj, yj] = RS_POLYGON[j];  // [lon, lat]
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function coordInCountry(lat, lon, countryId) {
  const c = COUNTRIES.find(c => c.id === countryId);
  if (!c) return true;
  
  // Para BR-RS, usar fronteira precisa
  if (countryId === 'BR-RS') {
    return isPointInRS(lat, lon);
  }
  
  // Para outros países, usar bbox retangular
  const { minLat, maxLat, minLon, maxLon } = c.bbox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

function loadOccurrencesSync() {
  try {
    return JSON.parse(localStorage.getItem('pescamon-occurrences')) || [];
  } catch {
    return [];
  }
}

const occurrenceIcon = L.divIcon({
  className: 'occurrence-marker',
  html: '<div class="occurrence-dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function MapClickHandler({ onMapClick, registering }) {
  useMapEvents({
    click(event) {
      if (registering) {
        onMapClick([event.latlng.lat, event.latlng.lng]);
      }
    }
  });
  return null;
}

function SpotClickHandler({ onRightClick }) {
  useMapEvents({
    contextmenu(e) {
      e.originalEvent.preventDefault();
      onRightClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function MapController({ focusedCell, mapBounds, country }) {
  const map = useMap();
  // Recentraliza o mapa ao trocar de país (a prop `center` do MapContainer é só inicial).
  const firstCountry = useRef(true);
  useEffect(() => {
    if (!country) return;
    const c = COUNTRIES.find(x => x.id === country);
    if (!c?.center) return;
    const center = [c.center.latitude, c.center.longitude];
    const zoom = c.defaultZoom || map.getZoom();
    if (firstCountry.current) { firstCountry.current = false; map.setView(center, zoom, { animate: false }); }
    else { map.flyTo(center, zoom, { duration: 1.0 }); }
  }, [country, map]);
  useEffect(() => {
    if (!focusedCell) return;
    // Suporte a { center, zoom } para navegar por região
    if (focusedCell.center) {
      map.flyTo(focusedCell.center, focusedCell.zoom || 10, { duration: 1.2 });
      return;
    }
    const path = focusedCell.path;
    if (!path || path.length === 0) return;
    const lats = path.map(p => p[0]);
    const lngs = path.map(p => p[1]);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    map.flyTo([centerLat, centerLng], 16, { duration: 1 });
  }, [focusedCell, map]);
  useEffect(() => {
    if (!mapBounds?.sw || !mapBounds?.ne) return;
    map.flyToBounds([mapBounds.sw, mapBounds.ne], { padding: [40, 40], duration: 1.2, maxZoom: 14 });
  }, [mapBounds, map]);
  return null;
}

const fallbackScenarios = [
  { id: 'amanhecer', name: 'Amanhecer', hour: 7, airTemperature: 15, waterTemperature: 16, solarRadiation: 18, wind: 12, pressureTrend: 'estável', sunrise: '07:36', sunset: '17:52' },
  { id: 'meio-dia', name: 'Meio-dia', hour: 13, airTemperature: 21, waterTemperature: 18, solarRadiation: 82, wind: 18, pressureTrend: 'subindo', sunrise: '07:36', sunset: '17:52' },
  { id: 'entardecer', name: 'Entardecer', hour: 18, airTemperature: 17, waterTemperature: 17, solarRadiation: 12, wind: 9, pressureTrend: 'estável', sunrise: '07:36', sunset: '17:52' },
  { id: 'noite', name: 'Noite', hour: 22, airTemperature: 13, waterTemperature: 15, solarRadiation: 0, wind: 6, pressureTrend: 'caindo', sunrise: '07:36', sunset: '17:52' }
];

function estimateWaterTemperature(airTemperature, soilTemperature = null) {
  if (soilTemperature != null) {
    // Temperatura do solo 0-7 cm é proxy excelente para temp. superficial do rio;
    // aplica leve suavização com a temp. do ar (peso 80/20)
    return Math.round(soilTemperature * 0.8 + airTemperature * 0.2);
  }
  return Math.round(airTemperature * 0.85 + 2.4);
}

function estimateSolarPercent(shortwave) {
  return Math.round(Math.min(100, (shortwave / 1000) * 100));
}

function pressureTrendLabel(current, previous) {
  const delta = current - previous;
  if (delta > 1) return 'subindo';
  if (delta < -1) return 'caindo';
  return 'estável';
}

function formatTime(isoString) {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function fetchCurrentWeather() {
  const params = [
    `latitude=${RIVER_CENTER.latitude}`,
    `longitude=${RIVER_CENTER.longitude}`,
    'current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,shortwave_radiation,soil_temperature_0_to_7cm',
    'hourly=surface_pressure',
    'daily=sunrise,sunset',
    'timezone=America/Montevideo',
    'forecast_days=1'
  ].join('&');

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}`);
  }

  const data = await response.json();
  const current = data.current;
  const hourlyPressure = data.hourly?.surface_pressure || [];
  const currentHour = new Date(current.time).getHours();
  const previousPressure = hourlyPressure[Math.max(0, currentHour - 1)] || current.surface_pressure;

  return {
    id: 'clima-atual',
    name: 'Clima atual',
    hour: currentHour,
    airTemperature: Math.round(current.temperature_2m),
    waterTemperature: estimateWaterTemperature(current.temperature_2m, current.soil_temperature_0_to_7cm ?? null),
    solarRadiation: estimateSolarPercent(current.shortwave_radiation || 0),
    wind: Math.round(current.wind_speed_10m),
    pressureTrend: pressureTrendLabel(current.surface_pressure, previousPressure),
    sunrise: formatTime(data.daily?.sunrise?.[0]),
    sunset: formatTime(data.daily?.sunset?.[0]),
    humidity: current.relative_humidity_2m,
    pressure: Math.round(current.surface_pressure),
    live: true
  };
}

async function fetchWeekForecast() {
  const params = [
    `latitude=${RIVER_CENTER.latitude}`,
    `longitude=${RIVER_CENTER.longitude}`,
    'daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,shortwave_radiation_sum,soil_temperature_0_to_7cm_mean,surface_pressure_mean',
    'timezone=America/Montevideo',
    'forecast_days=7'
  ].join('&');

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo forecast ${response.status}`);
  const data = await response.json();
  const d = data.daily;
  return d.time.map((date, i) => {
    const pressure = d.surface_pressure_mean?.[i] ? Math.round(d.surface_pressure_mean[i]) : null;
    const prevPressure = i > 0 && d.surface_pressure_mean?.[i - 1] ? Math.round(d.surface_pressure_mean[i - 1]) : null;
    const pressureTrend = pressure && prevPressure ? pressureTrendLabel(pressure, prevPressure) : 'estável';
    return {
      date,
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      waterTemp: estimateWaterTemperature((d.temperature_2m_max[i] + d.temperature_2m_min[i]) / 2, d.soil_temperature_0_to_7cm_mean?.[i] ?? null),
      rain: Math.round(d.precipitation_sum[i] * 10) / 10,
      wind: Math.round(d.wind_speed_10m_max[i]),
      radiation: d.shortwave_radiation_sum[i] || 0,
      sunrise: formatTime(d.sunrise[i]),
      sunset: formatTime(d.sunset[i]),
      pressure,
      pressureTrend,
    };
  });
}

async function fetchRiverDischarge() {
  const params = [
    `latitude=${RIVER_CENTER.latitude}`,
    `longitude=${RIVER_CENTER.longitude}`,
    'daily=river_discharge',
    'past_days=30',
    'forecast_days=7',
    'timezone=America/Montevideo'
  ].join('&');

  const response = await fetch(`https://flood-api.open-meteo.com/v1/flood?${params}`);

  if (!response.ok) throw new Error(`Flood API ${response.status}`);

  const data = await response.json();
  const times = data.daily?.time || [];
  const values = data.daily?.river_discharge || [];

  const today = new Date().toISOString().slice(0, 10);
  const todayIndex = times.indexOf(today);
  const currentDischarge = todayIndex >= 0 ? values[todayIndex] : values[values.length - 8] || null;
  const yesterdayDischarge = todayIndex > 0 ? values[todayIndex - 1] : values[values.length - 9] || null;

  let trend = 'estável';

  if (currentDischarge != null && yesterdayDischarge != null) {
    const delta = currentDischarge - yesterdayDischarge;
    if (delta > currentDischarge * 0.1) trend = 'subindo';
    else if (delta < -currentDischarge * 0.1) trend = 'caindo';
  }

  const avg30 = values.slice(0, Math.max(1, times.indexOf(today) + 1)).reduce((s, v) => s + (v || 0), 0) / Math.max(1, times.indexOf(today) + 1);

  const alerts = [];
  const forecastStart = todayIndex >= 0 ? todayIndex + 1 : times.length - 7;

  for (let i = forecastStart; i < times.length; i += 1) {
    if (values[i] == null || avg30 <= 0) continue;
    const ratio = values[i] / avg30;
    const day = times[i];

    if (ratio > 3.0) alerts.push({ day, type: 'flood-extreme', ratio, value: values[i], label: 'Cheia extrema' });
    else if (ratio > 2.0) alerts.push({ day, type: 'flood-high', ratio, value: values[i], label: 'Cheia alta' });
    else if (ratio < 0.4) alerts.push({ day, type: 'drought-severe', ratio, value: values[i], label: 'Seca severa' });
    else if (ratio < 0.7) alerts.push({ day, type: 'drought-moderate', ratio, value: values[i], label: 'Seca moderada' });
  }

  return {
    current: currentDischarge != null ? Math.round(currentDischarge * 10) / 10 : null,
    trend,
    avg30: Math.round(avg30 * 10) / 10,
    times,
    values,
    alerts,
    unit: 'm³/s'
  };
}

function DischargeChart({ dischargeData }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    if (!canvasRef.current || !dischargeData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const { times, values } = dischargeData;

    ctx.clearRect(0, 0, width, height);

    if (!times.length) return;

    const pad = { top: 8, right: 8, bottom: 20, left: 32 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;

    const maxVal = Math.max(...values.filter((v) => v != null), 1);
    const xStep = times.length > 1 ? cw / (times.length - 1) : cw;

    const today = new Date().toISOString().slice(0, 10);
    const todayIdx = times.indexOf(today);

    if (todayIdx > 0) {
      const todayX = pad.left + todayIdx * xStep;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
      ctx.fillRect(todayX, pad.top, width - pad.right - todayX, ch);
      ctx.fillStyle = '#67e8f9';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('forecast →', todayX + 2, pad.top + 10);
    }

    ctx.strokeStyle = 'rgba(148, 216, 255, 0.1)';
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 3; i += 1) {
      const y = pad.top + ch - (i / 3) * ch;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#9ecadd';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((i / 3) * maxVal), pad.left - 3, y + 3);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (let i = 0; i < values.length; i += 1) {
      if (values[i] == null) continue;
      const x = pad.left + (times.length > 1 ? i * xStep : cw / 2);
      const y = pad.top + ch - (values[i] / maxVal) * ch;
      if (i === 0 || values[i - 1] == null) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();

    const labelInterval = Math.max(1, Math.floor(times.length / 5));
    ctx.fillStyle = '#9ecadd';
    ctx.font = '8px system-ui';
    ctx.textAlign = 'center';

    for (let i = 0; i < times.length; i += labelInterval) {
      const x = pad.left + i * xStep;
      ctx.fillText(times[i].slice(5), x, height - 3);
    }
  }, [dischargeData]);

  if (!dischargeData) return null;

  return <canvas ref={canvasRef} className="discharge-canvas" />;
}

// Rios adicionais do Uruguai — carregados via Overpass API (rate limit)
// Overlays "herói" legados (Río Negro, Uruguay, Santa Lucía em linhas azuis grossas) —
// herança do MVP focado no Rio Santa Lucía. Hoje a rede oficial completa (DINAGUA no UY,
// BHO no RS) já desenha esses rios na cor da sua bacia, então os overlays viram duplicata
// visual (rios "destacados" em tons de azul). Mantemos os dados (heatmap/seleção usam
// EXTRA_RIVERS), mas NÃO desenhamos os overlays. Reative pontualmente se precisar.
const SHOW_LEGACY_HERO_RIVERS = false;

const EXTRA_RIVERS = [
  {
    id: '__rio_negro__',
    name: 'Río Negro',
    osmRelationId: '2736261',
    center: [-32.8, -56.5],
    zoom: 9,
    bbox: [-34.0, -59.0, -31.5, -55.0],
    color: '#3b82f6',
    type: 'rio_negro',
    country: 'UY',
  },
  {
    id: '__rio_yi__',
    name: 'Río Yi',
    osmRelationId: '2736262',
    center: [-33.3, -56.2],
    zoom: 9,
    bbox: [-34.2, -57.5, -32.5, -55.0],
    color: '#06b6d4',
    type: 'rio_negro',
    country: 'UY',
  },
  {
    id: '__rio_uruguay__',
    name: 'Río Uruguay',
    osmRelationId: '296847',
    center: [-32.0, -58.0],
    zoom: 8,
    bbox: [-34.5, -59.0, -30.0, -57.0],
    color: '#0ea5e9',
    country: 'UY',
  },
  // ── Costa do Río de la Plata ──────────────────────────────────────
  {
    id: '__arroyo_solis_grande__',
    name: 'Arroyo Solís Grande',
    osmRelationId: null,
    center: [-34.78, -55.57],
    zoom: 11,
    bbox: [-35.0, -56.0, -34.4, -55.2],
    color: '#38bdf8',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_pando__',
    name: 'Arroyo Pando',
    osmRelationId: null,
    center: [-34.72, -55.96],
    zoom: 11,
    bbox: [-34.9, -56.3, -34.5, -55.6],
    color: '#7dd3fc',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__rio_san_jose__',
    name: 'Río San José',
    osmRelationId: null,
    center: [-34.5, -56.7],
    zoom: 10,
    bbox: [-34.8, -57.2, -34.1, -56.2],
    color: '#60a5fa',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_rosario__',
    name: 'Arroyo Rosario',
    osmRelationId: null,
    center: [-34.3, -57.35],
    zoom: 10,
    bbox: [-34.6, -57.7, -34.0, -57.0],
    color: '#93c5fd',
    type: 'estuario',
    country: 'UY',
  },
  // ── Costa Atlântica ───────────────────────────────────────────────
  {
    id: '__arroyo_maldonado__',
    name: 'Arroyo Maldonado',
    osmRelationId: null,
    center: [-34.9, -54.95],
    zoom: 11,
    bbox: [-35.1, -55.3, -34.7, -54.6],
    color: '#2dd4bf',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_jose_ignacio__',
    name: 'Arroyo José Ignacio',
    osmRelationId: null,
    center: [-34.83, -54.65],
    zoom: 11,
    bbox: [-34.95, -54.85, -34.7, -54.45],
    color: '#34d399',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_garzon__',
    name: 'Arroyo Garzón',
    osmRelationId: null,
    center: [-34.77, -54.52],
    zoom: 11,
    bbox: [-34.9, -54.7, -34.65, -54.35],
    color: '#4ade80',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_rocha__',
    name: 'Arroyo de Rocha',
    osmRelationId: null,
    center: [-34.5, -54.35],
    zoom: 10,
    bbox: [-34.7, -54.6, -34.3, -54.1],
    color: '#86efac',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__arroyo_valizas__',
    name: 'Arroyo Valizas',
    osmRelationId: null,
    center: [-34.33, -53.78],
    zoom: 11,
    bbox: [-34.5, -54.0, -34.2, -53.6],
    color: '#6ee7b7',
    type: 'estuario',
    country: 'UY',
  },
  {
    id: '__rio_cebollati__',
    name: 'Río Cebollatí',
    osmRelationId: null,
    center: [-33.3, -53.8],
    zoom: 9,
    bbox: [-34.2, -54.5, -32.5, -53.2],
    color: '#5eead4',
    type: 'rio_patos',
    country: 'UY',
  },
  {
    id: '__rio_olimar__',
    name: 'Río Olimar Grande',
    osmRelationId: null,
    center: [-33.1, -54.5],
    zoom: 9,
    bbox: [-34.0, -55.2, -32.4, -53.8],
    color: '#67e8f9',
    type: 'rio_patos',
    country: 'UY',
  },
  // ── Lagoas costeiras ─────────────────────────────────────────────
  {
    id: '__laguna_sauce__',
    name: 'Laguna del Sauce',
    osmRelationId: null,
    center: [-34.85, -55.12],
    zoom: 12,
    bbox: [-34.95, -55.25, -34.75, -55.0],
    color: '#a78bfa',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_jose_ignacio__',
    name: 'Laguna José Ignacio',
    osmRelationId: null,
    center: [-34.82, -54.67],
    zoom: 12,
    bbox: [-34.9, -54.78, -34.75, -54.57],
    color: '#c084fc',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_garzon__',
    name: 'Laguna Garzón',
    osmRelationId: null,
    center: [-34.78, -54.53],
    zoom: 12,
    bbox: [-34.86, -54.63, -34.7, -54.43],
    color: '#e879f9',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_rocha__',
    name: 'Laguna de Rocha',
    osmRelationId: null,
    center: [-34.5, -54.3],
    zoom: 11,
    bbox: [-34.65, -54.5, -34.35, -54.1],
    color: '#f0abfc',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_castillos__',
    name: 'Laguna de Castillos',
    osmRelationId: null,
    center: [-34.2, -53.85],
    zoom: 10,
    bbox: [-34.45, -54.1, -34.0, -53.6],
    color: '#d8b4fe',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_merin__',
    name: 'Laguna Merín',
    osmRelationId: null,
    center: [-33.0, -53.35],
    zoom: 8,
    bbox: [-34.0, -53.8, -32.0, -52.9],
    country: 'UY',
    color: '#818cf8',
    type: 'lagoon',
  },
  // ── Lagoas interiores e costeiras restantes ──────────────────────
  {
    id: '__laguna_negra__',
    name: 'Laguna Negra',
    osmRelationId: null,
    center: [-33.88, -53.55],
    zoom: 10,
    bbox: [-34.1, -53.8, -33.65, -53.3],
    color: '#334155',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_cisne__',
    name: 'Laguna del Cisne',
    osmRelationId: null,
    center: [-34.68, -55.82],
    zoom: 11,
    bbox: [-34.8, -55.98, -34.56, -55.66],
    color: '#e0f2fe',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_diario__',
    name: 'Laguna del Diario',
    osmRelationId: null,
    center: [-34.88, -54.88],
    zoom: 12,
    bbox: [-34.95, -54.98, -34.81, -54.78],
    color: '#bfdbfe',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_lavanderas__',
    name: 'Laguna de las Lavanderas',
    osmRelationId: null,
    center: [-34.75, -55.35],
    zoom: 12,
    bbox: [-34.82, -55.45, -34.68, -55.25],
    color: '#ddd6fe',
    type: 'lagoon',
    country: 'UY',
  },
  {
    id: '__laguna_nutrias__',
    name: 'Laguna de las Nutrias',
    osmRelationId: null,
    center: [-33.55, -57.85],
    zoom: 11,
    bbox: [-33.7, -58.05, -33.4, -57.65],
    color: '#fde68a',
    country: 'UY',
    type: 'lagoon',
  },
  // ── Litoral norte — afluentes do Río Uruguay ─────────────────────
  {
    id: '__rio_cuareim__',
    name: 'Río Cuareim',
    osmRelationId: null,
    center: [-30.4, -57.4],
    zoom: 9,
    bbox: [-30.9, -58.2, -30.0, -56.5],
    color: '#fb923c',
    type: 'rio_norte',
    country: 'UY',
  },
  {
    id: '__rio_arapey_grande__',
    name: 'Río Arapey Grande',
    osmRelationId: null,
    center: [-33.25, -58.0],
    zoom: 9,
    bbox: [-33.8, -58.5, -32.7, -57.4],
    color: '#c4b5fd',
    type: 'rio_norte',
    country: 'UY',
  },
  {
    id: '__rio_arapey_chico__',
    name: 'Río Arapey Chico',
    osmRelationId: null,
    center: [-31.3, -57.8],
    zoom: 10,
    bbox: [-31.7, -58.2, -30.9, -57.4],
    color: '#fed7aa',
    type: 'rio_norte',
    country: 'UY',
  },
  {
    id: '__rio_dayman__',
    name: 'Río Daymán',
    osmRelationId: null,
    center: [-31.7, -57.9],
    zoom: 9,
    bbox: [-32.3, -58.3, -31.1, -57.2],
    color: '#fca5a5',
    type: 'rio_norte',
    country: 'UY',
  },
  {
    id: '__rio_queguay_grande__',
    name: 'Río Queguay Grande',
    osmRelationId: null,
    center: [-32.25, -57.6],
    zoom: 9,
    bbox: [-32.8, -58.1, -31.7, -56.8],
    country: 'UY',
    color: '#f9a8d4',
    type: 'rio_norte',
  },
  {
    id: '__rio_queguay_chico__',
    name: 'Río Queguay Chico',
    osmRelationId: null,
    center: [-32.4, -57.3],
    zoom: 10,
    bbox: [-32.8, -57.8, -32.0, -56.9],
    color: '#fbcfe8',
    type: 'rio_norte',
    country: 'UY',
  },
  {
    id: '__rio_san_salvador__',
    name: 'Río San Salvador',
    osmRelationId: null,
    center: [-33.25, -58.0],
    zoom: 9,
    bbox: [-33.8, -58.5, -32.7, -57.4],
    color: '#c4b5fd',
    type: 'rio_norte',
    country: 'UY',
  },
  // ── Bacia do Río Negro ────────────────────────────────────
  {
    id: '__rio_tacuarembo__',
    name: 'Río Tacuarembó',
    osmRelationId: null,
    center: [-31.7, -55.9],
    zoom: 9,
    bbox: [-32.5, -56.8, -30.9, -55.0],
    color: '#93c5fd',
    type: 'rio_negro',
    country: 'UY',
  },
  {
    id: '__rio_caraguata__',
    name: 'Río Caraguatá',
    osmRelationId: null,
    center: [-31.5, -55.5],
    zoom: 10,
    bbox: [-32.0, -56.2, -31.0, -54.8],
    color: '#6ee7b7',
    type: 'rio_negro',
    country: 'UY',
  },
  // ── Rios interiores — bacias independentes ──────────────────────────────────
  {
    id: '__rio_grande_uy__',
    name: 'Río Grande',
    osmRelationId: null,
    center: [-33.9, -57.0],
    country: 'UY',
    zoom: 10,
    bbox: [-34.3, -57.6, -33.5, -56.4],
    color: '#a5b4fc',
    type: 'rio_negro',
  },
  {
    id: '__rio_porongos__',
    name: 'Río Porongos',
    osmRelationId: null,
    center: [-33.5, -56.8],
    zoom: 10,
    bbox: [-33.9, -57.3, -33.1, -56.3],
    color: '#c7d2fe',
    type: 'rio_negro',
    country: 'UY',
  },
  {
    id: '__rio_chamanga__',
    name: 'Río Chamangá',
    osmRelationId: null,
    center: [-34.2, -56.6],
    zoom: 10,
    bbox: [-34.5, -57.0, -33.9, -56.2],
    color: '#e9d5ff',
    type: 'rio_negro',
    country: 'UY',
  },
  {
    id: '__arroyo_grande_uy__',
    name: 'Arroyo Grande',
    osmRelationId: null,
    center: [-33.7, -58.1],
    zoom: 10,
    bbox: [-34.1, -58.5, -33.3, -57.7],
    color: '#bbf7d0',
    type: 'rio_norte',
    country: 'UY',
  },
  // ── Bacia da Laguna Merín — rios orientais ───────────────────────────────────
  {
    id: '__rio_tacuari__',
    name: 'Río Tacuarí',
    osmRelationId: null,
    center: [-32.85, -53.7],
    zoom: 9,
    bbox: [-33.5, -54.2, -32.2, -53.2],
    color: '#99f6e4',
    type: 'rio_patos',
    country: 'UY',
  },
  {
    id: '__rio_olimar_chico__',
    name: 'Río Olimar Chico',
    osmRelationId: null,
    center: [-33.5, -54.8],
    zoom: 10,
    bbox: [-33.9, -55.2, -33.1, -54.4],
    color: '#67e8f9',
    type: 'rio_patos',
    country: 'UY',
  },
  {
    id: '__arroyo_india_muerta__',
    name: 'Arroyo de la India Muerta',
    osmRelationId: null,
    center: [-33.95, -54.2],
    zoom: 10,
    bbox: [-34.3, -54.6, -33.6, -53.8],
    color: '#a5f3fc',
    type: 'rio_patos',
    country: 'UY',
  },
  {
    id: '__rio_jaguarao__',
    name: 'Río Jaguarão',
    osmRelationId: null,
    center: [-32.55, -53.35],
    zoom: 9,
    bbox: [-33.1, -53.7, -32.0, -53.0],
    color: '#7dd3fc',
    type: 'rio_patos',
    country: 'UY',
  },
  // ── Arroios de Montevidéu e Canelones ──────────────────────────────────
  {
    id: '__arroyo_carrasco__',
    name: 'Arroyo Carrasco',
    osmRelationId: null,
    center: [-34.86, -56.02],
    zoom: 12,
    bbox: [-34.98, -56.18, -34.74, -55.86],
    color: '#60a5fa',
    type: 'arroio_urbano',
    country: 'UY',
  },
  {
    id: '__arroyo_miguelete__',
    name: 'Arroyo Miguelete',
    osmRelationId: null,
    center: [-34.88, -56.2],
    zoom: 12,
    bbox: [-34.97, -56.35, -34.79, -56.05],
    color: '#93c5fd',
    type: 'arroio_urbano',
    country: 'UY',
  },
  {
    id: '__arroyo_solis_chico__',
    name: 'Arroyo Solís Chico',
    osmRelationId: null,
    center: [-34.76, -55.72],
    zoom: 12,
    bbox: [-34.9, -55.9, -34.62, -55.54],
    color: '#bfdbfe',
    country: 'UY',
    type: 'estuario',
  },
  {
    id: '__arroyo_pantanoso__',
    name: 'Arroyo Pantanoso',
    osmRelationId: null,
    center: [-34.9, -56.28],
    zoom: 12,
    bbox: [-34.98, -56.42, -34.82, -56.14],
    color: '#d1d5db',
    type: 'arroio_urbano',
    country: 'UY',
  },
];

// Regiões hidrográficas do Uruguai — 6 bacias principais
const REGIONS = [
  // ══════════════════════════════════════════════════════════════════
  // 1. Bacia do Rio Uruguai
  // Todos os afluentes que drenam para o Río Uruguay pelo lado oriental
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'bacia_uruguai',
    name: 'Bacia do Rio Uruguai',
    emoji: '🏞️',
    center: [-32.0, -57.8],
    zoom: 7,
    // Faixa longitudinal oeste: lon < -57.0 — litoral do Río Uruguay
    bbox: { minLat: -34.5, maxLat: -29.5, minLon: -59.0, maxLon: -57.0 },
    watercourseIds: [
      '__rio_uruguay__',
      // Afluentes do norte (Artigas / Salto / Paysandú)
      '__rio_cuareim__',
      '__rio_arapey_grande__',
      '__rio_arapey_chico__',
      '__rio_dayman__',
      '__rio_queguay_grande__',
      '__rio_queguay_chico__',
      // Afluentes do sul (Soriano / Colonia / Rio Negro)
      '__rio_san_salvador__',
      '__arroyo_grande_uy__',
      '__laguna_nutrias__',
    ],
    matchTributaries: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. Bacia do Rio Negro
  // Maior bacia interior do Uruguai — drena para o Río Uruguay
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'bacia_rio_negro',
    name: 'Bacia do Rio Negro',
    emoji: '💧',
    center: [-32.3, -56.0],
    zoom: 8,
    // Interior centro-norte: lat > -33.5, lon entre -59 e -54.5
    bbox: { minLat: -33.5, maxLat: -29.5, minLon: -59.0, maxLon: -54.5 },
    watercourseIds: [
      '__rio_negro__',
      '__rio_tacuarembo__',
      '__rio_caraguata__',
      '__rio_yi__',
      '__rio_porongos__',
      '__rio_grande_uy__',
      '__rio_chamanga__',
    ],
    matchTributaries: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. Bacia da Laguna Merín
  // Drena para a Laguna Merín e daí para o Oceano Atlântico / RS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'bacia_merin',
    name: 'Bacia da Laguna Merín',
    emoji: '🌿',
    center: [-33.1, -53.6],
    zoom: 7,
    // Leste: lon > -54.5
    bbox: { minLat: -34.2, maxLat: -31.0, minLon: -54.5, maxLon: -52.0 },
    watercourseIds: [
      '__laguna_merin__',
      '__laguna_negra__',
      '__rio_cebollati__',
      '__rio_olimar__',
      '__rio_olimar_chico__',
      '__rio_tacuari__',
      '__arroyo_india_muerta__',
      '__rio_jaguarao__',
    ],
    matchTributaries: false,
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. Bacia do Rio da Prata
  // Rios e arroios que drenam diretamente para o Río de la Plata
  // Inclui Montevidéu e sua periferia
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'bacia_plata',
    name: 'Bacia do Rio da Prata',
    emoji: '🌊',
    center: [-34.72, -56.4],
    zoom: 9,
    // Bacia do Plata + Santa Lucía (sub-bacia): drena toda a faixa sul
    bbox: { minLat: -35.2, maxLat: -33.5, minLon: -58.5, maxLon: -54.5 },
    watercourseIds: [
      // Rio Santa Lucía (principal afluente do Plata em território uruguaio)
      '__santa_lucia__',
      // Arroios de Montevidéu e Canelones que desaguam no Plata
      '__arroyo_carrasco__',
      '__arroyo_miguelete__',
      '__arroyo_pantanoso__',
      '__laguna_cisne__',
      '__laguna_lavanderas__',
      // Arroios e rios a oeste de Montevidéu (San José / Colonia)
      '__arroyo_solis_chico__',
      '__arroyo_solis_grande__',
      '__arroyo_pando__',
      '__rio_san_jose__',
      '__arroyo_rosario__',
    ],
    matchTributaries: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. Vertente / Bacia Atlântica
  // Rios, arroios e lagoas costeiras que drenam diretamente para o
  // Oceano Atlântico (Maldonado, Rocha)
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'vertente_atlantica',
    name: 'Vertente Atlântica',
    emoji: '🏖️',
    center: [-34.45, -54.2],
    zoom: 8,
    // Costa atlântica: lon entre -55.3 e -52.0, lat > -35.0
    bbox: { minLat: -35.0, maxLat: -33.5, minLon: -55.3, maxLon: -52.0 },
    watercourseIds: [
      // Maldonado
      '__arroyo_maldonado__',
      '__laguna_sauce__',
      '__laguna_diario__',
      '__laguna_jose_ignacio__',
      '__arroyo_jose_ignacio__',
      '__laguna_garzon__',
      '__arroyo_garzon__',
      // Rocha
      '__laguna_rocha__',
      '__arroyo_rocha__',
      '__laguna_castillos__',
      '__arroyo_valizas__',
    ],
    matchTributaries: false,
  },
];

const extraRiversCache = {}; // Resetado para v5-state-filtered

// ============================================================
// Singleton de tributários ancorado em globalThis
// — sobrevive ao HMR do Vite (que reexecuta o módulo)
// — o bloco de carregamento só roda se tilesLoaded === false
// ============================================================
const _TRIB_VERSION = 'v48-uy-dinagua'; // Hidrografia oficial BHO 2017 (ANA), recortada à fronteira IBGE; Uruguai Strahler>=3, demais bacias >=1
if (!globalThis.__pescamon_trib__ || globalThis.__pescamon_trib__._version !== _TRIB_VERSION) {
  console.log('[TRIB] Resetando singleton para versão', _TRIB_VERSION);
  globalThis.__pescamon_trib__ = {
    _version: _TRIB_VERSION,
    data: [],
    seenIds: new Set(),
    subscribers: new Set(),
    loadedCountry: null,   // país actualmente carregado
    loading: false,
  };
} else {
  console.log('[TRIB] Usando singleton existente versão', globalThis.__pescamon_trib__._version);
}
const _trib = globalThis.__pescamon_trib__;

function _tribNotify() {
  _trib.subscribers.forEach(fn => fn());
}

function useTributaryLines() {
  return useSyncExternalStore(
    (cb) => { _trib.subscribers.add(cb); return () => _trib.subscribers.delete(cb); },
    () => _trib.data,
    () => _trib.data,
  );
}

// Carrega bacias via manifesto por país — executa apenas uma vez por sessão (globalThis singleton)
if (!_trib.geoJsonLoaded) {
  _trib.geoJsonLoaded = true;

  fetch(`/trib_manifest.json?t=${Date.now()}`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
    .then(manifest => {
      console.log('[TRIB] Manifest carregado:', Object.keys(manifest));
      _trib._manifest = manifest;
      const countryId = localStorage.getItem('pescamon_country') || 'UY';
      console.log('[TRIB] País selecionado do localStorage:', countryId);
      loadTribsForCountry(countryId);
    });
}

// Recarrega bacias quando o país muda — chamado pelo hook useEffect em App
async function loadTribsForCountry(countryId) {
  console.log('[TRIB] Carregando tributários para país:', countryId);
  console.log('[TRIB] loadedCountry atual:', _trib.loadedCountry);
  
  if (_trib.loadedCountry === countryId) {
    console.log('[TRIB] País já carregado, retornando');
    return;
  }
  
  console.log('[TRIB] Iniciando carregamento para', countryId);
  _trib.data = [];
  _trib.seenIds = new Set();
  _trib.loadedCountry = countryId;
  _trib.loading = true;
  
  // Função auxiliar para calcular centro
  function getCenter(paths) {
    const flat = paths.flat();
    if (!flat.length) return [-32.8, -56]; // Centro padrão do Uruguai
    const lat = flat.reduce((s, p) => s + p[0], 0) / flat.length;
    const lon = flat.reduce((s, p) => s + p[1], 0) / flat.length;
    return [lat, lon];
  }
  
  try {
    // Usar sistema antigo com manifest
    const manifest = _trib._manifest || {};
    const countryFiles = manifest[countryId] || [];
    const countryBbox = COUNTRIES.find(c => c.id === countryId)?.bbox || null;
    
    console.log('[TRIB] Arquivos para', countryId, ':', countryFiles.map(f => f.file));
    console.log('[TRIB] BBOX do país:', countryBbox);
    
    // Função para verificar se coordenadas estão dentro do bbox do país
    const isInCountry = (paths) => {
      console.log('🔍🔍🔍 isInCountry CHAMADA! BBOX:', countryBbox);
      if (!countryBbox) {
        console.log('[DEBUG] isInCountry: sem bbox, retornando true');
        return true;
      }
      const { minLat, maxLat, minLon, maxLon } = countryBbox;
      let total = 0, inside = 0;
      
      // Mostrar primeiros pontos para debug
      const samplePoints = [];
      for (const seg of paths) {
        for (const pt of seg) {
          total++;
          const [lat, lon] = pt;
          if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) inside++;
          if (samplePoints.length < 3) {
            samplePoints.push([lat, lon]);
          }
        }
        if (samplePoints.length >= 3) break;
      }
      
      console.log('📍 Amostra de coordenadas:', samplePoints[0], samplePoints[1], samplePoints[2]);
      console.log('📍 BBOX RS: lat', minLat, 'a', maxLat, ', lon', minLon, 'a', maxLon);
      
      // Verificação explícita dos pontos de amostra
      let sampleInside = 0;
      for (let i = 0; i < samplePoints.length; i++) {
        const pt = samplePoints[i];
        if (pt && pt.length >= 2) {
          const [lat, lon] = pt;
          const isInside = (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon);
          console.log(`📍 Ponto ${i+1}: [${lat}, ${lon}] - ${isInside ? 'DENTRO' : 'FORA'} do bbox`);
          if (isInside) sampleInside++;
        }
      }
      
      const ratio = total === 0 ? 0 : (inside / total);
      // Para Brasil, exigir 100% dos pontos dentro do bbox para evitar contaminação de estados vizinhos
      const requiredRatio = countryId === 'BR-RS' ? 1.0 : 0.90;
      const passes = total === 0 || ratio >= requiredRatio;
      console.log('[DEBUG] isInCountry:', total, 'pontos,', inside, 'dentros, ratio:', (ratio*100).toFixed(1) + '%', '→', passes ? 'PASSOU' : 'REJEITADO');
      console.log('[DEBUG] País:', countryId, '- Ratio exigido:', (requiredRatio*100) + '%');
      console.log('[DEBUG] Amostra:', sampleInside, 'de', samplePoints.length, 'pontos dentro do bbox');
      return passes;
    };
    
    for (const { file, regionId, baseRegionId } of countryFiles) {
      try {
        console.log('[TRIB] Carregando arquivo:', file);
        const response = await fetch(`/${file}?t=${Date.now()}`);
        if (!response.ok) {
          console.warn('[TRIB] Falha ao carregar', file, ':', response.status);
          continue;
        }
        const geojson = await response.json();
        
        // Verificar se é GeoJSON ou formato trib_*.json
        if (geojson.features && Array.isArray(geojson.features)) {
          // Formato GeoJSON
          for (const feature of geojson.features) {
            const id = feature.properties?.['name:latin'] || feature.properties?.name || feature.id || `trib-${_trib.data.length}`;
            if (_trib.seenIds.has(id)) continue;
            _trib.seenIds.add(id);
            
            let paths = feature.geometry?.coordinates || [];
            if (paths.length === 0) continue;
            
            // Cortar pontos fora do país ponto a ponto
            if (countryId === 'BR-RS') {
              // Usar fronteira precisa do RS (Rio Uruguai/Pelotas/Mampituba)
              paths = paths.map(seg =>
                seg.filter(pt => isPointInRS(pt[0], pt[1]))
              ).filter(seg => seg.length >= 2);
            } else if (countryBbox) {
              const { minLat, maxLat, minLon, maxLon } = countryBbox;
              paths = paths.map(seg =>
                seg.filter(pt => pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon)
              ).filter(seg => seg.length >= 2);
            }
            if (paths.length === 0) continue;
            
            _trib.data.push({
              id,
              name: feature.properties?.['name:latin'] || feature.properties?.name || id,
              type: feature.properties?.waterway || feature.properties?.natural || 'rio',
              paths,
              regionId: regionId || baseRegionId || 'bacia_desconhecida',
              center: getCenter(paths)
            });
          }
        } else if (Array.isArray(geojson)) {
          // Formato trib_*.json (array de objetos)
          for (const trib of geojson) {
            const id = trib.id || `trib-${_trib.data.length}`;
            if (_trib.seenIds.has(id)) continue;
            _trib.seenIds.add(id);
            
            let paths = trib.paths || [];
            if (paths.length === 0) continue;
            
            // Para BR-RS: dados já processados para o RS, não filtrar ponto a ponto
            if (countryId === 'BR-RS') {
              paths = paths.filter(seg => seg.length >= 2);
            } else if (countryBbox) {
              const { minLat, maxLat, minLon, maxLon } = countryBbox;
              paths = paths.map(seg =>
                seg.filter(pt => pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon)
              ).filter(seg => seg.length >= 2);
            }
            if (paths.length === 0) continue;
            
            _trib.data.push({
              id,
              name: trib.name || id,
              type: trib.type || 'rio',
              paths,
              // Para BR-RS: usar regionId do objeto (classificado por bacia) em vez do manifest
              regionId: (countryId === 'BR-RS' && trib.regionId) ? trib.regionId : (regionId || baseRegionId || trib.regionId || 'bacia_desconhecida'),
              center: getCenter(paths)
            });
          }
        }
      } catch (error) {
        console.warn('[TRIB] Erro ao processar arquivo', file, ':', error.message);
      }
    }
    
    console.log('[TRIB] Total carregado:', _trib.data.length, 'tributários');
    console.log('[TRIB] Primeiros 5 tributários:', _trib.data.slice(0, 5).map(t => ({ id: t.id, name: t.name, regionId: t.regionId })));
    
    // Carregar Santa Lucía apenas para UY (manter compatibilidade)
    if (countryId === 'UY') {
      await loadSantaLucia();
    }
    
    // Notificar subscribers
    console.log('[TRIB] Notificando', _trib.subscribers.size, 'subscribers');
    _tribNotify();
    console.log('[TRIB] _trib.data.length após notificar:', _trib.data.length);
    
  } catch (error) {
    console.error('[TRIB] Erro geral no carregamento:', error);
  } finally {
    _trib.loading = false;
    _tribNotify();
  }
}

// Função separada para Santa Lucía (mantida para compatibilidade)
async function loadSantaLucia() {
  try {
    const response = await fetch('/tributarios.geojson');
    if (!response.ok) return;
    
    const geojson = await response.json();
    if (!geojson) return;
    
    const SL_BBOX = { minLat: -35.0, maxLat: -33.0, minLon: -57.5, maxLon: -54.5 };
    const _inBbox = (coords, bbox) => {
      const pts = coords.filter(([lon, lat]) => lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon);
      return coords.length > 0 && pts.length / coords.length >= 0.5;
    };
    
    const MAIN_ID = 'relation/2736318';
    const MAIN_NAME = 'Río Santa Lucía';
    
    const fromRelations = geojson.features
      .filter(f =>
        f.properties?.['@id'] !== MAIN_ID &&
        f.properties?.['@id']?.startsWith('relation/') &&
        f.geometry?.type === 'MultiLineString' &&
        f.properties?.waterway &&
        _inBbox(f.geometry.coordinates.flat(), SL_BBOX)
      )
      .map(f => ({
        id: f.properties['@id'],
        name: f.properties.name || 'Afluente',
        regionId: 'bacia_plata_UY',
        countryId: f.properties.countryId || 'UY',
        paths: f.geometry.coordinates.map(line => line.map(([lon, lat]) => [lat, lon]))
      }));
    
    const fresh = fromRelations.filter(t => !_trib.seenIds.has(t.id));
    fresh.forEach(t => _trib.seenIds.add(t.id));
    if (fresh.length) { 
      _trib.data = [..._trib.data, ...fresh]; 
      _tribNotify(); 
    }
    
  } catch (error) {
    console.warn('[HYDRO] Erro ao carregar Santa Lucía:', error.message);
  }
}

async function fetchRiverGeometry(river) {
  if (extraRiversCache[river.id]) return extraRiversCache[river.id];

  // ── 1ª tentativa: arquivo local pré-exportado (sem rate limit) ──────────────
  try {
    const localRes = await fetch(`/rivers/${river.id}.json`);
    if (localRes.ok) {
      const localData = await localRes.json();
      if (localData?.paths?.length > 0) {
        extraRiversCache[river.id] = localData.paths;
        return localData.paths;
      }
    }
  } catch {
    // arquivo não existe — prossegue para Overpass
  }

  // Função para filtrar pontos por estado (apenas para rios do Brasil)
  const filterPathsByState = (paths, country) => {
    if (country !== 'BR-RS') return paths;
    
    const RS_BBOX = [-57.65, -33.75, -49.68, -27.08]; // [minLon, minLat, maxLon, maxLat]
    const isPointInRS = (point) => {
      const [lat, lon] = point;
      return lat >= RS_BBOX[1] && lat <= RS_BBOX[3] && lon >= RS_BBOX[0] && lon <= RS_BBOX[2];
    };

    return paths.map(path => {
      return path.filter(point => isPointInRS(point));
    }).filter(path => path.length >= 2); // Manter só paths com pelo menos 2 pontos
  };

  // ── 2ª tentativa: Overpass API (fallback quando não há arquivo local) ────────
  const [minLat, minLon, maxLat, maxLon] = river.bbox;
  const isLagoon = river.type === 'lagoon';

  let query;
  if (river.osmRelationId) {
    query = `[out:json][timeout:30];
(
  relation["@id"="${river.osmRelationId}"];
  relation["name"="${river.name}"]["waterway"]["type"="waterway"](${minLat},${minLon},${maxLat},${maxLon});
  way["name"="${river.name}"]["waterway"](${minLat},${minLon},${maxLat},${maxLon});
);
out body;>;out skel qt;`;
  } else if (isLagoon) {
    query = `[out:json][timeout:30];
(
  relation["name"="${river.name}"]["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
  way["name"="${river.name}"]["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
  relation["name"="${river.name}"]["water"](${minLat},${minLon},${maxLat},${maxLon});
);
out body;>;out skel qt;`;
  } else {
    query = `[out:json][timeout:30];
(
  relation["name"="${river.name}"]["waterway"="river"](${minLat},${minLon},${maxLat},${maxLon});
  relation["name"="${river.name}"]["waterway"="stream"](${minLat},${minLon},${maxLat},${maxLon});
  way["name"="${river.name}"]["waterway"="river"](${minLat},${minLon},${maxLat},${maxLon});
  way["name"="${river.name}"]["waterway"="stream"](${minLat},${minLon},${maxLat},${maxLon});
);
out body;>;out skel qt;`;
  }

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const nodes = {};
    data.elements.filter(e => e.type === 'node').forEach(n => { nodes[n.id] = [n.lat, n.lon]; });
    const paths = data.elements
      .filter(e => e.type === 'way' && e.nodes?.length > 1)
      .map(w => w.nodes.map(nid => nodes[nid]).filter(Boolean))
      .filter(p => p.length > 1);
    if (paths.length === 0) return null;
    
    // Aplicar filtragem por estado para rios do Brasil
    const filteredPaths = filterPathsByState(paths, river.country);
    if (filteredPaths.length === 0) return null;
    
    extraRiversCache[river.id] = filteredPaths;
    return filteredPaths;
  } catch {
    return null;
  }
}

// Bounding box do Uruguai com margem generosa
const URUGUAY_BBOX = { minLat: -35.0, maxLat: -30.0, minLon: -58.5, maxLon: -53.0 };

function isLineInUruguay(coords) {
  // Verifica se a maioria dos pontos da linha está dentro do bounding box do Uruguai
  const inBounds = coords.filter(
    ([lon, lat]) => lat >= URUGUAY_BBOX.minLat && lat <= URUGUAY_BBOX.maxLat &&
                    lon >= URUGUAY_BBOX.minLon && lon <= URUGUAY_BBOX.maxLon
  );
  return inBounds.length / coords.length >= 0.5;
}

function extractSantaLuciaGeometry(santaLuciaGeojson) {
  const URUGUAY_RELATION_ID = 'relation/2736318';

  // 1ª prioridade: usar apenas a relation do Uruguai pelo ID OSM
  const uruguayFeature = santaLuciaGeojson.features.find(
    (f) => f.properties?.['@id'] === URUGUAY_RELATION_ID
  );

  if (uruguayFeature?.geometry?.type === 'MultiLineString') {
    return uruguayFeature.geometry.coordinates
      .map((line) => line.map(([longitude, latitude]) => [latitude, longitude]));
  }

  // Fallback: filtrar por tipo MultiLineString + bounding box do Uruguai
  return santaLuciaGeojson.features
    .filter((feature) => feature.geometry?.type === 'MultiLineString')
    .flatMap((feature) => feature.geometry.coordinates)
    .filter(isLineInUruguay)
    .map((line) => line.map(([longitude, latitude]) => [latitude, longitude]));
}

function classifyRiverZone(center) {
  if (center[0] < -34.72 && center[1] < -56.32) return 'baixo curso estuarino';
  if (center[0] < -34.70 && center[1] < -56.18) return 'humedales e planície de inundação';
  if (center[1] < -56.02) return 'meandros rurais do médio curso';
  return 'alto curso e tributários principais';
}

// Classifica o tipo de curso d'água pelo nome para ajustar atributos de habitat
function classifyWatercourse(name = '') {
  const n = name.toLowerCase();
  if (/\bcanal\b/.test(n))                          return 'canal';    // artificial, regulado
  if (/\bca[ñn]ada\b/.test(n))                      return 'canada';   // pequeno, raso, sazonal
  if (/\bquebrada\b|\bbarranco\b/.test(n))          return 'quebrada'; // encaixado, correntoso
  // Tipos específicos do RS (antes das regras genéricas de lagoa/rio)
  if (/lagoa dos patos|guaiba|guaíba/.test(n))      return 'lagoa_patos';
  if (/jacuí|jacui|vacacaí|vacacai|ibicu[ií]|taquari|antas|pelotas/.test(n)) return 'rio_jacui';
  if (/camaquã|camaqua|piratini|jaguara/.test(n))   return 'rio_camaqua';
  if (/\bsanga\b/.test(n))                          return 'arroio_rs'; // sanga = arroio gaúcho
  if (/\blaguna\b|\blagoa\b|\blake\b/.test(n))      return 'lagoon';   // lagoa costeira
  if (/\barroyo\b|\barroio\b/.test(n))              return 'arroio';   // médio, meandrante
  if (/\bestuario\b/.test(n))                       return 'estuario'; // estuário
  if (/\br[ií]o\b|\briver\b/.test(n))              return 'rio';      // largo, profundo
  return 'arroio'; // fallback
}

// Modificadores de habitat por tipo de curso
const WATERCOURSE_MODIFIERS = {
  rio:      { widthMul: 1.8, depthAdd: 1.5, flowAdd: 0.12, vegMul: 0.85, shadeMul: 0.75, turbAdd: 0.10, oxyAdd: -0.04, strMul: 0.90 },
  arroio:   { widthMul: 1.0, depthAdd: 0.0, flowAdd: 0.00, vegMul: 1.00, shadeMul: 1.00, turbAdd: 0.00, oxyAdd:  0.00, strMul: 1.00 },
  canada:   { widthMul: 0.4, depthAdd:-0.6, flowAdd:-0.10, vegMul: 1.20, shadeMul: 1.30, turbAdd:-0.06, oxyAdd:  0.06, strMul: 1.10 },
  quebrada: { widthMul: 0.5, depthAdd: 0.4, flowAdd: 0.18, vegMul: 0.80, shadeMul: 1.40, turbAdd:-0.08, oxyAdd:  0.10, strMul: 1.20 },
  canal:    { widthMul: 0.7, depthAdd: 0.5, flowAdd: 0.20, vegMul: 0.40, shadeMul: 0.30, turbAdd: 0.05, oxyAdd: -0.05, strMul: 0.50 },
  lagoon:   { widthMul: 2.5, depthAdd: 1.0, flowAdd:-0.10, vegMul: 0.90, shadeMul: 0.50, turbAdd: 0.15, oxyAdd:  0.05, strMul: 0.60 },
  estuario: { widthMul: 1.4, depthAdd: 0.8, flowAdd: 0.05, vegMul: 0.75, shadeMul: 0.60, turbAdd: 0.20, oxyAdd:  0.02, strMul: 0.70 },
};

// Valores base de habitat calibrados por tipo de curso d'água
// Baseados em literatura de ictiologia neotropical e dados de campo do Uruguai
const HABITAT_BASE = {
  //              depth  flow  veg   shade turb  oxy   struct widthBase widthRange
  rio:         [  1.8,  0.48, 0.45, 0.20, 0.52, 0.60, 0.45,  8,  12 ],
  rio_norte:   [  2.5,  0.62, 0.38, 0.18, 0.58, 0.68, 0.42, 15,  20 ],
  rio_negro:   [  2.2,  0.45, 0.42, 0.22, 0.50, 0.62, 0.48, 10,  15 ],
  rio_patos:   [  1.4,  0.32, 0.62, 0.38, 0.35, 0.65, 0.60,  5,   8 ],
  arroio:      [  1.0,  0.42, 0.62, 0.42, 0.36, 0.68, 0.72,  2,   4 ],
  arroio_urbano:[0.6,  0.38, 0.28, 0.30, 0.78, 0.32, 0.35,  2,   3 ],
  canada:      [  0.5,  0.12, 0.82, 0.72, 0.22, 0.42, 0.78,  1,   2 ],
  quebrada:    [  0.8,  0.68, 0.48, 0.70, 0.18, 0.80, 0.85,  1,   2 ],
  canal:       [  1.2,  0.58, 0.18, 0.15, 0.62, 0.40, 0.22,  3,   4 ],
  lagoon:      [  1.5,  0.10, 0.55, 0.22, 0.65, 0.58, 0.42, 20,  30 ],
  estuario:    [  1.8,  0.28, 0.35, 0.18, 0.72, 0.55, 0.38, 10,  18 ],
};

function estimateSegmentHabitat(center, index, total, path, watercourseType = 'arroio') {
  const progress = total <= 1 ? 0 : index / (total - 1);
  const bend = path.length > 2 ? Math.abs(path[0][1] - path[path.length - 1][1]) + Math.abs(path[0][0] - path[path.length - 1][0]) : 0.05;
  const sinuosity = clamp(bend * 18, 0.18, 0.92);
  const isLowerCourse = center[0] < -34.72;
  const isWetland = center[0] < -34.70 && center[1] < -56.18;

  const b = HABITAT_BASE[watercourseType] || HABITAT_BASE.arroio;
  const [bDepth, bFlow, bVeg, bShade, bTurb, bOxy, bStr, bWidthBase, bWidthRange] = b;

  return {
    width: bWidthBase + (1 - progress) * bWidthRange,
    depth: clamp(bDepth + (1 - progress) * 1.8 + sinuosity * 0.5, 0.2, 9.0),
    flow: clamp(bFlow + progress * 0.18 + (isLowerCourse ? 0.06 : 0), 0.05, 0.95),
    vegetation: clamp((isWetland ? bVeg + 0.18 : bVeg) + sinuosity * 0.10, 0.05, 0.96),
    shade: clamp(bShade + sinuosity * 0.15, 0.05, 0.95),
    turbidity: clamp(bTurb + (isLowerCourse ? 0.12 : 0) + sinuosity * 0.08, 0.10, 0.92),
    oxygen: clamp(bOxy - (isWetland ? 0.08 : 0) + sinuosity * 0.06, 0.20, 0.95),
    structure: clamp(bStr + vegetationBoost(isWetland, sinuosity), 0.15, 0.95)
  };
}

function vegetationBoost(isWetland, sinuosity) {
  return (isWetland ? 0.24 : 0.10) + sinuosity * 0.20;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceMeters(pointA, pointB) {
  const earthRadius = 6371000;
  const deltaLatitude = toRadians(pointB[0] - pointA[0]);
  const deltaLongitude = toRadians(pointB[1] - pointA[1]);
  const latitudeA = toRadians(pointA[0]);
  const latitudeB = toRadians(pointB[0]);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function interpolatePoint(pointA, pointB, ratio) {
  return [
    pointA[0] + (pointB[0] - pointA[0]) * ratio,
    pointA[1] + (pointB[1] - pointA[1]) * ratio
  ];
}

function simplifyPath(path, maxPoints = 22) {
  if (path.length <= maxPoints) return path;

  const step = Math.max(1, Math.floor(path.length / maxPoints));
  const sampled = path.filter((_, index) => index % step === 0);
  const lastPoint = path[path.length - 1];

  if (sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }

  return sampled;
}

function splitLineByDistance(line, segmentLengthMeters) {
  const segments = [];
  let currentSegment = [line[0]];
  let currentLength = 0;

  for (let index = 1; index < line.length; index += 1) {
    let startPoint = line[index - 1];
    const endPoint = line[index];
    let remainingDistance = distanceMeters(startPoint, endPoint);

    while (currentLength + remainingDistance >= segmentLengthMeters && remainingDistance > 0) {
      const distanceToCut = segmentLengthMeters - currentLength;
      const ratio = distanceToCut / remainingDistance;
      const cutPoint = interpolatePoint(startPoint, endPoint, ratio);
      currentSegment.push(cutPoint);
      segments.push(currentSegment);
      currentSegment = [cutPoint];
      startPoint = cutPoint;
      remainingDistance = distanceMeters(startPoint, endPoint);
      currentLength = 0;
    }

    currentSegment.push(endPoint);
    currentLength += remainingDistance;
  }

  if (currentSegment.length >= 2 && currentLength >= segmentLengthMeters * 0.35) {
    segments.push(currentSegment);
  }

  return segments;
}

function computeBoundingBox(lines) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

  for (const line of lines) {
    for (const [lat, lon] of line) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }

  return { minLat, maxLat, minLon, maxLon };
}

function degreesPerKm(latitude) {
  const latDeg = 1 / 111.32;
  const lonDeg = 1 / (111.32 * Math.cos(toRadians(latitude)));
  return { latDeg, lonDeg };
}

function localSinuosity(points) {
  if (points.length < 2) return 0;

  let totalDistance = 0;

  for (let i = 1; i < points.length; i += 1) {
    totalDistance += distanceMeters(points[i - 1], points[i]);
  }

  const straightLine = distanceMeters(points[0], points[points.length - 1]);

  if (straightLine < 1) return 0.5;

  return clamp((totalDistance / straightLine - 1) * 2, 0, 1);
}

// Faixas de longitude do Rio Santa Lucía (foz → nascente: lon aumenta de -56.45 até -55.6)
// Cada entrada: [limSuperior, nome, latRef] — latRef é latitude central da localidade
const GEO_BANDS = [
  { maxLon: -56.40, name: 'Foz — Río de la Plata',    latRef: -34.82 },
  { maxLon: -56.35, name: 'Punta del Tigre',           latRef: -34.79 },
  { maxLon: -56.30, name: 'Isla de las Brujas',         latRef: -34.76 },
  { maxLon: -56.25, name: 'Santiago Vázquez',           latRef: -34.75 },
  { maxLon: -56.20, name: 'Paso del Sauce',             latRef: -34.72 },
  { maxLon: -56.14, name: 'Rincón de la Bolsa',         latRef: -34.68 },
  { maxLon: -56.08, name: 'Aguas Corrientes',           latRef: -34.64 },
  { maxLon: -56.02, name: 'Paso del Puerto',            latRef: -34.62 },
  { maxLon: -55.96, name: 'Paso Severino',              latRef: -34.58 },
  { maxLon: -55.90, name: 'Santa Lucía del Este',       latRef: -34.55 },
  { maxLon: -55.84, name: 'Santa Lucía',                latRef: -34.54 },
  { maxLon: -55.78, name: '25 de Agosto',               latRef: -34.52 },
  { maxLon: -55.72, name: 'Canelones — Paso del Molino',latRef: -34.52 },
  { maxLon: -55.66, name: 'Canelones',                  latRef: -34.52 },
  { maxLon: -55.60, name: 'Paso de los Toros',          latRef: -34.46 },
  { maxLon: -55.54, name: 'Minas — Alto Curso',         latRef: -34.38 },
];

function geoReference(center) {
  const lon = center[1];
  const lat = center[0];
  const band = GEO_BANDS.find((b) => lon <= b.maxLon);
  const baseName = band?.name ?? 'Nascente';
  const latRef = band?.latRef ?? lat;
  // Qualificador N/S baseado em desvio de latitude em relação ao centro da banda
  const latDelta = lat - latRef;
  const ns = latDelta > 0.018 ? ' — Margem Norte' : latDelta < -0.018 ? ' — Margem Sul' : '';
  return `${baseName}${ns}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMorphologicalSegments
// Divide um curso d'água em locais de pesca com base em características
// morfológicas reais: curvatura, comprimento mínimo/máximo e tipo de curso.
// Substitui buildGridCells (grade geográfica arbitrária).
// ─────────────────────────────────────────────────────────────────────────────
function buildMorphologicalSegments(lines, watercourseType = 'arroio', courseId = '', courseName = '') {
  // Parâmetros de segmentação por tipo de curso
  const PARAMS = {
    rio:      { minM: 800,  maxM: 3000, bendDeg: 25 },
    arroio:   { minM: 300,  maxM: 1200, bendDeg: 20 },
    canal:    { minM: 500,  maxM: 2000, bendDeg: 35 },
    canada:   { minM: 200,  maxM:  800, bendDeg: 18 },
    quebrada: { minM: 150,  maxM:  600, bendDeg: 15 },
    lagoon:   { minM: 400,  maxM: 2000, bendDeg: 30 },
    estuario: { minM: 600,  maxM: 2500, bendDeg: 28 },
  };
  const p = PARAMS[watercourseType] || PARAMS.arroio;

  // Filtra linhas válidas (mínimo 2 pontos)
  const validLines = lines.map(l => l.filter(Boolean)).filter(l => l.length >= 2);
  if (validLines.length === 0) return [];

  // Detecta quebras de curvatura: pontos onde o ângulo de deflexão supera bendDeg
  function deflectionDeg(a, b, c) {
    const v1 = [b[0] - a[0], b[1] - a[1]];
    const v2 = [c[0] - b[0], c[1] - b[1]];
    const dot = v1[0]*v2[0] + v1[1]*v2[1];
    const mag1 = Math.sqrt(v1[0]**2 + v1[1]**2);
    const mag2 = Math.sqrt(v2[0]**2 + v2[1]**2);
    if (mag1 < 1e-10 || mag2 < 1e-10) return 0;
    return Math.acos(clamp(dot / (mag1 * mag2), -1, 1)) * (180 / Math.PI);
  }

  // Segmenta uma única linha contígua, respeitando comprimento mínimo/máximo e curvatura
  function segmentLine(pts) {
    const segs = [];
    let current = [pts[0]];
    let currentLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const step = distanceMeters(pts[i-1], pts[i]);
      currentLen += step;
      current.push(pts[i]);
      const isBend = i >= 2 && deflectionDeg(pts[i-2], pts[i-1], pts[i]) > p.bendDeg;
      const isTooLong = currentLen >= p.maxM;
      if ((isBend || isTooLong) && currentLen >= p.minM) {
        segs.push(current);
        current = [pts[i]];
        currentLen = 0;
      }
    }
    if (current.length >= 2) {
      if (currentLen < p.minM * 0.4 && segs.length > 0) {
        segs[segs.length - 1].push(...current.slice(1));
      } else {
        segs.push(current);
      }
    }
    return segs;
  }

  // Processa cada linha individualmente — nunca concatena linhas distintas
  const rawSegments = validLines.flatMap(line => segmentLine(line));

  if (rawSegments.length === 0) return [];

  const total = rawSegments.length;

  return rawSegments.map((pts, index) => {
    // Centro geométrico do segmento
    const mid = pts[Math.floor(pts.length / 2)];
    const center = mid || pts[0];

    // Bounding box do segmento
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lat, lon] of pts) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    const pad = 0.002;
    const bounds = [[minLat - pad, minLon - pad], [maxLat + pad, maxLon + pad]];

    // Comprimento real
    let lengthMeters = 0;
    for (let i = 1; i < pts.length; i++) lengthMeters += distanceMeters(pts[i-1], pts[i]);

    const sinuosity = localSinuosity(pts);
    const habitat = estimateSegmentHabitat(center, index, total, pts, watercourseType);
    const zone = classifyRiverZone(center);

    // Morfologia descritiva
    const morphType =
      sinuosity > 0.55 ? 'meandro' :
      sinuosity > 0.25 ? 'sinuoso' : 'retilíneo';

    // Nome do local
    const geoRef = geoReference(center);
    const prefix = courseName || geoRef;
    const seq = String(index + 1).padStart(2, '0');
    const label = `${prefix} — ${morphType.charAt(0).toUpperCase() + morphType.slice(1)} ${seq}`;

    // Tipo de fundo estimado pela morfologia
    const substrate =
      morphType === 'meandro' ? 'areia/cascalho (erosão na curva externa)' :
      morphType === 'sinuoso' ? 'misto areia/lama' : 'lama/deposição';

    return {
      id: `morph-${courseId || 'sl'}-${index}`,
      code: `${(courseId || 'SL').toUpperCase().slice(0,4)}-${seq}`,
      name: label,
      center,
      bounds,
      path: simplifyPath(pts),
      lengthMeters: Math.round(lengthMeters),
      pointCount: pts.length,
      sinuosity: Math.round(sinuosity * 100),
      morphType,
      substrate,
      topography: zone,
      notes: `${morphType.charAt(0).toUpperCase() + morphType.slice(1)}, ${Math.round(lengthMeters)}m, fundo de ${substrate}. Sinuosidade: ${Math.round(sinuosity*100)}%.`,
      ...habitat,
    };
  });
}

// Mantido como alias para compatibilidade com código que ainda usa cellSizeKm
function buildGridCells(lines, _cellSizeKm = 1, watercourseType = 'arroio') {
  return buildMorphologicalSegments(lines, watercourseType);
}

const species = [
  // ── Espécies principais (já existentes) ──
  { id: 'tararira', name: 'Tararira', namePt: 'Traíra', nameEs: 'Tararira', nameEn: 'Wolf fish', scientificName: 'Hoplias malabaricus', conservation: { status: 'regulated', minSize: 33, note: 'Tamanho mínimo de captura: 33 cm (CARU). Pratique o pesque-e-solte para exemplares menores.' }, color: '#f97316', size: '30-60 cm', diet: 'peixes menores, anfíbios e invertebrados', activity: 'crepuscular', habits: 'predadora de emboscada, associada a vegetação, remansos e água mais quente', preferences: { depth: 2.2, flow: 0.36, vegetation: 0.88, shade: 0.58, turbidity: 0.50, oxygen: 0.56, structure: 0.82, temperature: 22, solar: 22, pressureSensitivity: 0.5 } },
  { id: 'dourado', name: 'Dourado', namePt: 'Dourado', nameEs: 'Dorado', nameEn: 'Golden dorado', scientificName: 'Salminus brasiliensis', conservation: { status: 'regulated', minSize: 65, seasonal: 'Veda de pesca comercial e desportiva de 1° de setembro a 31 de dezembro (CARU). Tamanho mínimo: 65 cm.', note: 'Respeite o período de veda. Prefira pesque-e-solte o ano todo.' }, color: '#eab308', size: '45-90 cm', diet: 'peixes forrageiros em correnteza', activity: 'diurna-crepuscular', habits: 'predador ativo, prefere canais oxigenados, bordas de corrente e passagem de alimento', preferences: { depth: 4.5, flow: 0.72, vegetation: 0.34, shade: 0.25, turbidity: 0.42, oxygen: 0.82, structure: 0.58, temperature: 20, solar: 48, pressureSensitivity: 0.85 } },
  { id: 'boga', name: 'Boga', namePt: 'Piapara', nameEs: 'Boga', nameEn: 'Boga', scientificName: 'Megaleporinus obtusidens', conservation: { status: 'regulated', minSize: 34, note: 'Tamanho mínimo de captura: 34 cm (CARU). Devolva exemplares menores com cuidado.' }, color: '#22c55e', size: '25-55 cm', diet: 'frutos, sementes, algas e matéria orgânica', activity: 'diurna', habits: 'onívora, frequenta margens vegetadas, fundos médios e áreas de alimento natural', preferences: { depth: 3.0, flow: 0.48, vegetation: 0.72, shade: 0.42, turbidity: 0.52, oxygen: 0.62, structure: 0.60, temperature: 19, solar: 54, pressureSensitivity: 0.7 } },
  { id: 'bagre', name: 'Bagre amarillo', namePt: 'Bagre-amarelo', nameEs: 'Bagre amarillo', nameEn: 'Spotted catfish', scientificName: 'Pimelodus maculatus', conservation: { status: 'regulated', minSize: 20, note: 'Tamanho mínimo: 20 cm (CARU). Devolva exemplares sublegais.' }, color: '#38bdf8', size: '20-45 cm', diet: 'invertebrados, pequenos peixes e detritos', activity: 'noturna-crepuscular', habits: 'bentônico, explora fundos, poços, zonas turvas e margens com alimento depositado', preferences: { depth: 4.2, flow: 0.44, vegetation: 0.46, shade: 0.55, turbidity: 0.76, oxygen: 0.58, structure: 0.62, temperature: 18, solar: 8, pressureSensitivity: 0.3 } },
  { id: 'pejerrey', name: 'Pejerrey', namePt: 'Peixe-rei', nameEs: 'Pejerrey', nameEn: 'Silverside', scientificName: 'Odontesthes spp.', conservation: { status: 'regulated', minSize: 25, note: 'Tamanho mínimo: 25 cm (CARU/DINARA). Devolva exemplares menores.' }, color: '#a78bfa', size: '18-40 cm', diet: 'zooplâncton, insetos e pequenos organismos', activity: 'diurna', habits: 'cardumes em águas abertas, temperaturas moderadas, boa oxigenação e luminosidade', preferences: { depth: 3.6, flow: 0.52, vegetation: 0.30, shade: 0.18, turbidity: 0.34, oxygen: 0.78, structure: 0.32, temperature: 15, solar: 64, pressureSensitivity: 0.9 } },
  { id: 'mojarra', name: 'Mojarra', namePt: 'Lambari', nameEs: 'Mojarra', nameEn: 'Tetra', scientificName: 'Astyanax spp.', color: '#fb7185', size: '6-14 cm', diet: 'insetos, microcrustáceos, algas e detritos', activity: 'diurna-crepuscular', habits: 'pequenos cardumes em margens vegetadas, águas rasas e zonas de abrigo', preferences: { depth: 1.6, flow: 0.34, vegetation: 0.82, shade: 0.50, turbidity: 0.48, oxygen: 0.64, structure: 0.70, temperature: 20, solar: 38, pressureSensitivity: 0.4 } },

  // ── Espécies nativas adicionais da bacia do Rio Santa Lucía ──
  { id: 'sabalito', name: 'Sábalo', namePt: 'Curimbatá', nameEs: 'Sábalo', nameEn: 'Streaked prochilod', scientificName: 'Prochilodus lineatus', conservation: { status: 'regulated', minSize: 34, note: 'Tamanho mínimo: 34 cm — longitud estándar (CARU Res. 59/12 — sábalo/Prochilodus lineatus). Migrador chave do ecossistema; pratique pesque-e-solte.' }, color: '#84cc16', size: '35-70 cm', diet: 'detritos orgânicos, algas bentônicas e matéria em suspensão', activity: 'diurna', habits: 'migrador, forma cardumes em canais profundos e corredeiras, sobe o rio na primavera', preferences: { depth: 4.0, flow: 0.65, vegetation: 0.38, shade: 0.28, turbidity: 0.68, oxygen: 0.64, structure: 0.50, temperature: 20, solar: 50 } },
  { id: 'patí', name: 'Patí', namePt: 'Pati', nameEs: 'Patí', nameEn: 'Pati catfish', scientificName: 'Luciopimelodus pati', conservation: { status: 'regulated', minSize: 40, note: 'Tamanho mínimo: 40 cm (CARU). Devolva exemplares sublegais com cuidado.' }, color: '#0ea5e9', size: '30-70 cm', diet: 'peixes, crustáceos e moluscos', activity: 'noturna', habits: 'predador bentônico de grande porte, ocupa poços profundos e fundos argilosos', preferences: { depth: 5.5, flow: 0.40, vegetation: 0.28, shade: 0.60, turbidity: 0.80, oxygen: 0.52, structure: 0.55, temperature: 19, solar: 5 } },
  { id: 'surubí', name: 'Surubí', namePt: 'Pintado', nameEs: 'Surubí pintado', nameEn: 'Spotted shovelnose catfish', scientificName: 'Pseudoplatystoma corruscans', conservation: { status: 'regulated', minSize: 85, note: 'Tamanho mínimo: 85 cm (CARU). O surubí pintado (P. fasciatum) tem VEDA ABSOLUTA — nunca pode ser capturado. Identifique a espécie corretamente.' }, color: '#6366f1', size: '60-130 cm', diet: 'peixes de médio a grande porte', activity: 'noturna-crepuscular', habits: 'predador topo de cadeia, habita canais profundos com fundo firme, escasso no Santa Lucía', preferences: { depth: 6.0, flow: 0.50, vegetation: 0.20, shade: 0.65, turbidity: 0.72, oxygen: 0.60, structure: 0.48, temperature: 21, solar: 6 } },
  { id: 'vieja_agua', name: 'Vieja del agua', namePt: 'Cascudo', nameEs: 'Vieja del agua', nameEn: 'Suckermouth catfish', scientificName: 'Hypostomus commersoni', color: '#78716c', size: '20-50 cm', diet: 'algas, biofilme e matéria orgânica raspada de substratos', activity: 'noturna', habits: 'bentônica, associada a rochas, troncos e substratos duros em corrente moderada', preferences: { depth: 2.5, flow: 0.55, vegetation: 0.45, shade: 0.70, turbidity: 0.50, oxygen: 0.68, structure: 0.90, temperature: 19, solar: 10 } },
  { id: 'palometa', name: 'Palometa', namePt: 'Pirambeba', nameEs: 'Palometa', nameEn: 'Piranha', scientificName: 'Serrasalmus spp.', color: '#ef4444', size: '15-30 cm', diet: 'peixes, escamas e tecidos de outros peixes', activity: 'diurna-crepuscular', habits: 'predadora em cardumes, ocorre em remansos e áreas de vegetação submersa', preferences: { depth: 2.8, flow: 0.38, vegetation: 0.62, shade: 0.45, turbidity: 0.58, oxygen: 0.60, structure: 0.65, temperature: 23, solar: 30 } },
  { id: 'armado', name: 'Armado', namePt: 'Abotoado', nameEs: 'Armado común', nameEn: 'Thorny catfish', scientificName: 'Pterodoras granulosus', conservation: { status: 'protected', note: '⚠️ VEDA ABSOLUTA no Río Uruguay (CARU Res. 59/12): Pterodoras granulosus (Armado común), Oxydoras kneri (Armado chancho), Rhinodoras dorbignyi e Megalodoras laevigatulus. Todas as espécies de armado devem ser devolvidas imediatamente.' }, color: '#d97706', size: '25-55 cm', diet: 'moluscos, crustáceos e invertebrados bentônicos', activity: 'noturna', habits: 'bentônico de fundo lodoso, tolera baixa oxigenação, localizado em poços e meandros', preferences: { depth: 4.5, flow: 0.35, vegetation: 0.40, shade: 0.58, turbidity: 0.82, oxygen: 0.42, structure: 0.60, temperature: 20, solar: 4 } },
  { id: 'corvina', name: 'Corvina de río', namePt: 'Corvina-do-rio', nameEs: 'Corvina de río', nameEn: 'River croaker', scientificName: 'Plagioscion ternetzi', color: '#c084fc', size: '20-50 cm', diet: 'peixes pequenos, camarões e insetos aquáticos', activity: 'noturna-crepuscular', habits: 'estuarino-fluvial, ocorre na porção baixa do Santa Lucía e braço do estuário', preferences: { depth: 4.0, flow: 0.42, vegetation: 0.32, shade: 0.48, turbidity: 0.70, oxygen: 0.55, structure: 0.52, temperature: 18, solar: 12 } },
  { id: 'anguilas', name: 'Anguila criolla', namePt: 'Mussum', nameEs: 'Anguila criolla', nameEn: 'Marbled swamp eel', scientificName: 'Synbranchus marmoratus', color: '#854d0e', size: '30-80 cm', diet: 'invertebrados, pequenos peixes e anfíbios', activity: 'noturna', habits: 'anfíbio-fluvial, esconde-se em buracos e vegetação densa na margem, resiste à dessecação', preferences: { depth: 1.2, flow: 0.22, vegetation: 0.90, shade: 0.80, turbidity: 0.60, oxygen: 0.38, structure: 0.88, temperature: 22, solar: 5 } },
  { id: 'carpa', name: 'Carpa', namePt: 'Carpa', nameEs: 'Carpa', nameEn: 'Common carp', scientificName: 'Cyprinus carpio', conservation: { status: 'invasive', note: 'Espécie exótica invasora — não devolva ao rio após capturar. Sua remoção é benéfica para o ecossistema nativo.' }, color: '#f59e0b', size: '30-80 cm', diet: 'invertebrados bentônicos, raízes, sementes e detritos', activity: 'diurna', habits: 'espécie exótica invasora, adapta-se a qualquer habitat, frequente em áreas turvas e eutrofizadas', preferences: { depth: 2.5, flow: 0.28, vegetation: 0.65, shade: 0.40, turbidity: 0.88, oxygen: 0.40, structure: 0.55, temperature: 18, solar: 35 } },
  { id: 'dientudo', name: 'Dientudo', namePt: 'Peixe-cachorra', nameEs: 'Dientudo', nameEn: 'Bigeye tetra', scientificName: 'Oligosarcus jenynsii', color: '#2dd4bf', size: '10-22 cm', diet: 'insetos aquáticos, zooplâncton e pequenos peixes', activity: 'diurna-crepuscular', habits: 'predador ágil de porte médio, cardumes em margens com estrutura e zonas de corrente leve', preferences: { depth: 1.8, flow: 0.45, vegetation: 0.68, shade: 0.45, turbidity: 0.40, oxygen: 0.72, structure: 0.72, temperature: 18, solar: 42 } },
  { id: 'tachuela', name: 'Tachuela', namePt: 'Cascarudo', nameEs: 'Tachuela / Cascarudo', nameEn: 'Armored catfish', scientificName: 'Callichthys callichthys', color: '#92400e', size: '10-20 cm', diet: 'detritos, invertebrados e matéria orgânica', activity: 'noturna', habits: 'bentônico de águas rasas e lamacentas, resiste a baixo oxigênio, frequente em banhados', preferences: { depth: 0.8, flow: 0.15, vegetation: 0.85, shade: 0.75, turbidity: 0.90, oxygen: 0.25, structure: 0.80, temperature: 22, solar: 6 } },

  // ── Espécies típicas de afluentes (arroios e cañadas) — bacia do Santa Lucía ──
  { id: 'australoheros', name: 'Chanchita', namePt: 'Cará-chanchita', nameEs: 'Chanchita / Cabeza amarilla', nameEn: 'Yellow-headed cichlid', scientificName: 'Australoheros scitulus', color: '#16a34a', size: '8-15 cm', diet: 'insetos aquáticos, crustáceos, algas e detritos', activity: 'diurna', habits: 'cíclido territorial de arroios com vegetação densa, substratos rochosos e raízes; constrói ninhos em fundo', preferences: { depth: 0.8, flow: 0.28, vegetation: 0.90, shade: 0.72, turbidity: 0.38, oxygen: 0.62, structure: 0.92, temperature: 20, solar: 28 } },
  { id: 'gymnogeophagus', name: 'Castañeta', namePt: 'Geofágido', nameEs: 'Castañeta / Geófago', nameEn: 'Eartheater cichlid', scientificName: 'Gymnogeophagus mekinos', color: '#0891b2', size: '8-14 cm', diet: 'invertebrados bentônicos, larvas de insetos e matéria orgânica do fundo', activity: 'diurna', habits: 'cíclido geófago de arroios rasos com substrato arenoso-pedregoso, peneira areia em busca de alimento', preferences: { depth: 0.7, flow: 0.32, vegetation: 0.55, shade: 0.50, turbidity: 0.35, oxygen: 0.70, structure: 0.75, temperature: 19, solar: 40 } },
  { id: 'crenicichla', name: 'Lucio de arroyo', namePt: 'Joaninha', nameEs: 'Lucio de arroyo', nameEn: 'Pike cichlid', scientificName: 'Crenicichla scottii', color: '#dc2626', size: '12-25 cm', diet: 'peixes pequenos, crustáceos e insetos aquáticos', activity: 'crepuscular', habits: 'predador de emboscada em arroios com corrente moderada, esconde-se entre pedras e raízes', preferences: { depth: 1.0, flow: 0.50, vegetation: 0.60, shade: 0.65, turbidity: 0.42, oxygen: 0.68, structure: 0.88, temperature: 20, solar: 18 } },
  { id: 'jenynsia', name: 'Madrecita', namePt: 'Jenínsia', nameEs: 'Madrecita / Jenynsia', nameEn: 'One-sided livebearer', scientificName: 'Jenynsia lineata', color: '#65a30d', size: '3-8 cm', diet: 'mosquitos, larvas, zooplâncton e algas filamentosas', activity: 'diurna', habits: 'víviparo de águas rasas e calmas, margens vegetadas de cañadas e banhados, tolera baixo oxigênio', preferences: { depth: 0.3, flow: 0.12, vegetation: 0.92, shade: 0.60, turbidity: 0.55, oxygen: 0.30, structure: 0.78, temperature: 22, solar: 45 } },
  { id: 'cnesterodon', name: 'Barrigudito', namePt: 'Barrigudinho', nameEs: 'Barrigudito / Cnesterodon', nameEn: 'Mosquitofish', scientificName: 'Cnesterodon decemaculatus', color: '#7c3aed', size: '2-5 cm', diet: 'algas, larvas de mosquito e matéria orgânica em suspensão', activity: 'diurna', habits: 'peixe víviparo de menor porte, coloniza cañadas temporárias, banhados e margens com vegetação emergente', preferences: { depth: 0.2, flow: 0.08, vegetation: 0.95, shade: 0.65, turbidity: 0.60, oxygen: 0.22, structure: 0.82, temperature: 23, solar: 50 } },
  { id: 'rineloricaria', name: 'Limpiavidrios', namePt: 'Viola-de-arroio', nameEs: 'Limpiavidrios / Rineloricaria', nameEn: 'Whiptail catfish', scientificName: 'Rineloricaria spp.', color: '#78716c', size: '8-18 cm', diet: 'algas, biofilme, detritos raspados de pedras e raízes', activity: 'noturna', habits: 'bentônico de arroios claros com fundo rochoso-arenoso e corrente moderada; característico do Santa Lucía Chico', preferences: { depth: 0.6, flow: 0.55, vegetation: 0.40, shade: 0.60, turbidity: 0.28, oxygen: 0.78, structure: 0.95, temperature: 18, solar: 8 } },
  { id: 'bryconamericus', name: 'Virolito', namePt: 'Piaba-do-sul', nameEs: 'Virolito / Characidium', nameEn: 'South American tetra', scientificName: 'Bryconamericus iheringii', color: '#f472b6', size: '4-9 cm', diet: 'insetos terrestres, algas, microcrustáceos e detritos', activity: 'diurna', habits: 'tetra de pequeno porte em cardumes, habita margens de arroios com vegetação ripária densa e corrente leve', preferences: { depth: 0.5, flow: 0.38, vegetation: 0.85, shade: 0.58, turbidity: 0.32, oxygen: 0.72, structure: 0.68, temperature: 19, solar: 42 } },
  { id: 'heptapterus', name: 'Bagre de arroyo', namePt: 'Bagre-de-arroio', nameEs: 'Bagre de arroyo / Heptapterus', nameEn: 'Torrent catfish', scientificName: 'Heptapterus mustelinus', color: '#b45309', size: '6-15 cm', diet: 'invertebrados bentônicos, larvas de insetos e detritos', activity: 'noturna', habits: 'bagre pequeno de arroios com fundo lodoso-arenoso e vegetação submersa; esconde-se sob folhiço e raízes', preferences: { depth: 0.5, flow: 0.22, vegetation: 0.75, shade: 0.80, turbidity: 0.55, oxygen: 0.45, structure: 0.85, temperature: 20, solar: 5 } },

  // ── Espécies do litoral norte e Río Uruguay (ecorregião Uruguai Inferior) ──
  { id: 'manguruyu', name: 'Manguruyú', namePt: 'Jaú', nameEs: 'Manguruyú', nameEn: 'Gilded catfish', scientificName: 'Zungaro jahu', conservation: { status: 'protected', note: '⚠️ VEDA ABSOLUTA no Río Uruguay (Res. CARU 59/12). É proibida qualquer captura em qualquer modalidade de pesca. Espécie ameaçada de extinção.' }, color: '#713f12', size: '80-180 cm', diet: 'peixes grandes, especialmente bagres e boga', activity: 'noturna', habits: 'maior bagre predador da bacia do Prata; ocupa canais profundos e corredeiras do Río Uruguay e afluentes; espécie ameaçada, pesca restrita', preferences: { depth: 7.0, flow: 0.65, vegetation: 0.15, shade: 0.70, turbidity: 0.75, oxygen: 0.55, structure: 0.45, temperature: 22, solar: 3 } },
  { id: 'pacu', name: 'Pacú', namePt: 'Pacu', nameEs: 'Pacú', nameEn: 'Pacu', scientificName: 'Piaractus mesopotamicus', conservation: { status: 'protected', note: '⚠️ VEDA ABSOLUTA no Río Uruguay (Res. CARU 59/12). É proibida qualquer captura em qualquer modalidade de pesca.' }, color: '#15803d', size: '40-80 cm', diet: 'frutos, sementes, invertebrados e material vegetal', activity: 'diurna', habits: 'migrador de grandes rios, sobe afluentes na primavera; prefere margens alagadas e remansos com vegetação ribeirinha', preferences: { depth: 3.5, flow: 0.55, vegetation: 0.70, shade: 0.38, turbidity: 0.55, oxygen: 0.68, structure: 0.55, temperature: 23, solar: 45 } },
  { id: 'pira_pita', name: 'Pira-pitá', namePt: 'Piracanjuba', nameEs: 'Pira-pitá / Salmón del río', nameEn: 'Piracanjuba', scientificName: 'Brycon orbignyanus', conservation: { status: 'protected', note: '⚠️ VEDA ABSOLUTA no Río Uruguay (Res. CARU 59/12 — "salmón de río"). Espécie criticamente ameaçada no Uruguai. Qualquer captura é proibida.' }, color: '#dc2626', size: '40-75 cm', diet: 'frutos, insetos, algas e pequenos peixes', activity: 'diurna-crepuscular', habits: 'migrador reófilo, sobe corredeiras em grupos; espécie ameaçada no Uruguai, ocorre em rios com boa qualidade de água do litoral norte', preferences: { depth: 3.0, flow: 0.78, vegetation: 0.55, shade: 0.30, turbidity: 0.32, oxygen: 0.85, structure: 0.55, temperature: 22, solar: 52 } },
  { id: 'austrolebias', name: 'Pez anual', namePt: 'Peixe-anual', nameEs: 'Pez anual / Austrolebias', nameEn: 'Annual killifish', scientificName: 'Austrolebias spp.', conservation: { status: 'vulnerable', note: 'Diversas espécies do gênero Austrolebias são vulneráveis ou ameaçadas. Seus habitats (banhados temporários) estão ameaçados pela agricultura. Não colete; apenas observe e fotografe.' }, color: '#0891b2', size: '3-10 cm', diet: 'microcrustáceos, larvas de insetos e zooplâncton', activity: 'diurna', habits: 'killifish endêmico de lagoas e banhados temporários do leste do Uruguai; ovos sobrevivem à seca no sedimento; indicador de qualidade ambiental', preferences: { depth: 0.2, flow: 0.05, vegetation: 0.88, shade: 0.55, turbidity: 0.45, oxygen: 0.35, structure: 0.72, temperature: 20, solar: 55 } },

  // ── Espécies costeiras e lagunares (costa atlântica e Río de la Plata) ──
  { id: 'corvina_negra', name: 'Corvina negra', namePt: 'Miraguaia', nameEs: 'Corvina negra', nameEn: 'Black drum', scientificName: 'Pogonias cromis', conservation: { status: 'regulated', minSize: 40, note: 'Verifique a legislação atual da DINARA. Devolva exemplares pequenos — espécie de crescimento lento.' }, color: '#1e293b', size: '40-120 cm', diet: 'moluscos, crustáceos, ouriços e pequenos peixes', activity: 'diurna-crepuscular', habits: 'estuarino-lagunar, entra pelas barras quando abertas ao mar; prefere fundos lodosos com moluscos; um dos maiores peixes da costa uruguaia', preferences: { depth: 4.0, flow: 0.25, vegetation: 0.30, shade: 0.40, turbidity: 0.72, oxygen: 0.55, structure: 0.58, temperature: 17, solar: 30 } },
  { id: 'corvina_branca', name: 'Corvina', namePt: 'Corvina', nameEs: 'Corvina blanca', nameEn: 'Whitemouth croaker', scientificName: 'Micropogonias furnieri', conservation: { status: 'regulated', minSize: 32, note: 'Tamanho mínimo: 32 cm (Dec. 149/997 – DINARA). Espécie mais capturada do Uruguai; o cumprimento das normas é essencial para sua sustentabilidade.' }, color: '#94a3b8', size: '25-70 cm', diet: 'camarões, poliquetas, moluscos e pequenos peixes', activity: 'noturna-crepuscular', habits: 'espécie estuarino-marinha mais capturada do Uruguai; entra em lagoas costeiras e arroios na maré; tolera salinidade variável', preferences: { depth: 3.5, flow: 0.30, vegetation: 0.25, shade: 0.38, turbidity: 0.65, oxygen: 0.58, structure: 0.50, temperature: 16, solar: 20 } },
  { id: 'lenguado', name: 'Lenguado', namePt: 'Linguado-brasileiro', nameEs: 'Lenguado', nameEn: 'Brazilian flounder', scientificName: 'Paralichthys orbignyanus', color: '#a8a29e', size: '20-60 cm', diet: 'peixes pequenos, camarões e invertebrados bentônicos', activity: 'crepuscular-noturna', habits: 'demersal de fundo arenoso-lodoso, camuflado; encontrado em lagoas costeiras, estuários e praias de areia grossa', preferences: { depth: 2.5, flow: 0.18, vegetation: 0.15, shade: 0.45, turbidity: 0.55, oxygen: 0.60, structure: 0.70, temperature: 15, solar: 10 } },
  { id: 'lisa', name: 'Lisa', namePt: 'Tainha', nameEs: 'Lisa', nameEn: 'Striped mullet', scientificName: 'Mugil liza', color: '#64748b', size: '30-80 cm', diet: 'algas, detritos, fitoplâncton e matéria orgânica em suspensão', activity: 'diurna', habits: 'migratória catádroma, forma grandes cardumes em estuários e lagoas; sobe arroios costeiros; muito capturada na pesca artesanal uruguaia', preferences: { depth: 2.0, flow: 0.35, vegetation: 0.40, shade: 0.22, turbidity: 0.60, oxygen: 0.62, structure: 0.35, temperature: 18, solar: 55 } },
  { id: 'lacha', name: 'Lacha', namePt: 'Savelha', nameEs: 'Lacha', nameEn: 'Menhaden', scientificName: 'Brevoortia aurea', color: '#fbbf24', size: '20-45 cm', diet: 'fitoplâncton, zooplâncton e partículas orgânicas em suspensão', activity: 'diurna', habits: 'pelágica de cardume, penetra massivamente em lagoas costeiras quando a barra abre; atrai corvinas e outras predadoras', preferences: { depth: 1.5, flow: 0.40, vegetation: 0.20, shade: 0.15, turbidity: 0.58, oxygen: 0.65, structure: 0.20, temperature: 17, solar: 60 } },
  { id: 'buricheta', name: 'Burriqueta', namePt: 'Roncador', nameEs: 'Burriqueta', nameEn: 'Grunt', scientificName: 'Conodon nobilis', color: '#f97316', size: '15-35 cm', diet: 'crustáceos, poliquetas e pequenos peixes', activity: 'noturna-crepuscular', habits: 'costeira de fundo rochoso e arenoso, frequente em desembocaduras de arroios no Río de la Plata; popular na pesca de praia', preferences: { depth: 2.0, flow: 0.28, vegetation: 0.18, shade: 0.35, turbidity: 0.50, oxygen: 0.62, structure: 0.65, temperature: 16, solar: 15 } },
  { id: 'pescadilla', name: 'Pescadilla', namePt: 'Pescada-olhuda', nameEs: 'Pescadilla', nameEn: 'South Atlantic weakfish', scientificName: 'Cynoscion guatucupa', conservation: { status: 'regulated', minSize: 27, note: 'Tamanho mínimo: 27 cm (Dec. 149/997 – DINARA). Devolva exemplares menores.' }, color: '#7dd3fc', size: '20-50 cm', diet: 'peixes pequenos, camarões e lulas', activity: 'noturna-crepuscular', habits: 'predadora estuarino-costeira, forma cardumes em águas rasas; entra em lagoas e arroios costeiros; muito apreciada na pesca desportiva uruguaia', preferences: { depth: 3.0, flow: 0.32, vegetation: 0.20, shade: 0.30, turbidity: 0.48, oxygen: 0.68, structure: 0.45, temperature: 15, solar: 18 } },

  // ── Espécies adicionadas na revisão de maio/2026 — lacunas identificadas na lista oficial (CLOFF-UY) ──
  { id: 'rhamdia', name: 'Bagre negro', namePt: 'Jundiá', nameEs: 'Bagre negro', nameEn: 'South American catfish', scientificName: 'Rhamdia quelen', conservation: { status: 'regulated', minSize: 24, note: 'Tamanho mínimo: 24 cm — longitud estándar (CARU Res. 59/12 — bagre negro). Espécie muito comum em arroios e rios de todo o Uruguai; importante na pesca artesanal local.' }, color: '#57534e', size: '20-50 cm', diet: 'invertebrados, peixes pequenos, frutos e carniça', activity: 'noturna', habits: 'bagre generalista e altamente adaptado; coloniza desde arroios de cabeceira até rios grandes; esconde-se sob pedras, raizes e folhiço; indicador de qualidade ambiental em arroios', preferences: { depth: 1.8, flow: 0.35, vegetation: 0.60, shade: 0.72, turbidity: 0.55, oxygen: 0.50, structure: 0.80, temperature: 19, solar: 6 } },
  { id: 'corydoras', name: 'Doradito', namePt: 'Coridora', nameEs: 'Doradito / Corydoras', nameEn: 'Bronze corydoras', scientificName: 'Corydoras paleatus', color: '#a16207', size: '5-8 cm', diet: 'invertebrados bentônicos, detritos e restos orgânicos do fundo', activity: 'diurna', habits: 'bagre corazaço de pequeno porte; vive em cardumes sobre fundos areno-lodosos em arroios e margens de rios; muito resistente; um dos peixes mais comuns do leste e sul do Uruguai', preferences: { depth: 0.6, flow: 0.28, vegetation: 0.55, shade: 0.50, turbidity: 0.60, oxygen: 0.45, structure: 0.75, temperature: 20, solar: 25 } },
  { id: 'chafalote', name: 'Chafalote', namePt: 'Cachorra-facão', nameEs: 'Chafalote', nameEn: 'Dogtooth characin', scientificName: 'Rhaphiodon vulpinus', conservation: { status: 'regulated', minSize: 50, note: 'Tamanho mínimo recomendado: 50 cm. Predador importante do ecossistema fluvial; pratique pesque-e-solte.' }, color: '#b45309', size: '40-80 cm', diet: 'peixes de médio porte capturados em emboscada', activity: 'crepuscular-noturna', habits: 'predador pelágico esguio com dentes grandes e salientes; cobre distâncias nos canais do Río Uruguay e afluentes de grande porte como o Queguay e o Daymán; confundido com o dorado por iniciantes', preferences: { depth: 4.5, flow: 0.62, vegetation: 0.22, shade: 0.42, turbidity: 0.48, oxygen: 0.72, structure: 0.40, temperature: 21, solar: 20 } },
  { id: 'bagre_branco', name: 'Bagre branco', namePt: 'Bagre branco', nameEs: 'Bagre blanco / Plateado', nameEn: 'White catfish', scientificName: 'Pimelodus albicans', conservation: { status: 'regulated', minSize: 22, note: 'Tamanho mínimo: 22 cm — longitud estándar (CARU Res. 59/12 — bagre blanco). Espécie comercialmente importante no Río Uruguay e Río de la Plata.' }, color: '#cbd5e1', size: '25-55 cm', diet: 'peixes, crustáceos, frutos e detritos', activity: 'noturna-crepuscular', habits: 'bagre médio de água parada ou lenta; ocupa o Rio de la Plata, baixo Río Uruguay e afluentes de menor declive; comum na pesca noturna com isca natural', preferences: { depth: 4.0, flow: 0.38, vegetation: 0.35, shade: 0.52, turbidity: 0.72, oxygen: 0.55, structure: 0.58, temperature: 19, solar: 8 } },
  { id: 'castaneta', name: 'Castañeta', namePt: 'Acará', nameEs: 'Castañeta / Acará', nameEn: 'Pearl cichlid', scientificName: 'Geophagus brasiliensis', color: '#4ade80', size: '15-28 cm', diet: 'invertebrados bentônicos, detritos e material vegetal peneirado', activity: 'diurna', habits: 'cíclido geófago territorial de rios e arroios com substrato arenoso-pedregoso; comum na bacia do Rio da Prata e rios orientais; constrói ninhos e cuida da prole; apreciado na pesca esportiva com isca artificial', preferences: { depth: 1.5, flow: 0.40, vegetation: 0.50, shade: 0.48, turbidity: 0.40, oxygen: 0.65, structure: 0.80, temperature: 21, solar: 35 } },
  { id: 'morena', name: 'Morena', namePt: 'Sarapó', nameEs: 'Morena / Gymnotus', nameEn: 'Banded knifefish', scientificName: 'Gymnotus omarorum', color: '#7e22ce', size: '20-45 cm', diet: 'invertebrados, peixes pequenos e larvas de insetos', activity: 'noturna', habits: 'peixe elétrico de água parada ou lenta; muito comum em banhados, cãas e zonas de vegetação densa; usa descarga elétrica para navegar, comunicar e aturdir presas; espécie endêmica do Uruguai', preferences: { depth: 0.8, flow: 0.12, vegetation: 0.92, shade: 0.80, turbidity: 0.70, oxygen: 0.32, structure: 0.88, temperature: 22, solar: 8 } },
  { id: 'boga_lisa', name: 'Boga lisa', namePt: 'Piau-listrado', nameEs: 'Boga lisa', nameEn: 'Striped leporinus', scientificName: 'Schizodon borellii', conservation: { status: 'regulated', minSize: 30, note: 'Tamanho mínimo recomendado: 30 cm. Espécie nativa comum na bacia do Río Negro e Río Uruguay; não confundir com a boga (Megaleporinus obtusidens).' }, color: '#86efac', size: '20-40 cm', diet: 'macrófitas aquáticas, algas e material vegetal', activity: 'diurna', habits: 'herbívora de margens vegetadas; frequenta o Río Negro, seus afluentes e o médio Río Uruguay; mais esguia e pequena que a boga tradicional; dentes frontais cortantes adaptados a material vegetal', preferences: { depth: 2.5, flow: 0.45, vegetation: 0.82, shade: 0.35, turbidity: 0.42, oxygen: 0.68, structure: 0.52, temperature: 20, solar: 55 } },
  { id: 'hoplosternum', name: 'Cuyaya', namePt: 'Tamboatá', nameEs: 'Cuyaya / Cascarudo', nameEn: 'Armored catfish', scientificName: 'Hoplosternum littorale', color: '#78350f', size: '15-25 cm', diet: 'detritos, invertebrados bentônicos, larvas de insetos e matéria orgânica', activity: 'noturna-crepuscular', habits: 'bagre coraçado maior que o cascarudo comum; frequenta banhados, lagoas rasas e margens de rios com fundo lodoso; constrói ninhos flutuantes de bolhas; muito comum no norte e leste do Uruguai', preferences: { depth: 0.7, flow: 0.12, vegetation: 0.88, shade: 0.68, turbidity: 0.82, oxygen: 0.22, structure: 0.78, temperature: 23, solar: 8 } },
  { id: 'leporino', name: 'Trompa roja', namePt: 'Piau', nameEs: 'Leporino / Trompa roja', nameEn: 'Banded leporinus', scientificName: 'Leporinus lacustris', conservation: { status: 'regulated', minSize: 28, note: 'Tamanho mínimo recomendado: 28 cm. Espécie nativa dos grandes rios do Uruguai; não confundir com a boga (Megaleporinus obtusidens).' }, color: '#f59e0b', size: '18-35 cm', diet: 'frutos, sementes, algas, invertebrados e material vegetal', activity: 'diurna', habits: 'herbívoro-onívoro de rios de médio a grande porte; ocorre no Río Uruguay e afluentes maiores (Queguay, Daymán, Arapey); nada em cardumes perto de margens vegetadas e em corredeiras; identificado pelas faixas escuras transversais no corpo', preferences: { depth: 2.8, flow: 0.58, vegetation: 0.65, shade: 0.32, turbidity: 0.40, oxygen: 0.72, structure: 0.48, temperature: 21, solar: 50 } },
  { id: 'pachyurus', name: 'Corvina de río', namePt: 'Corvina-do-rio', nameEs: 'Corvina de río', nameEn: 'South American river croaker', scientificName: 'Pachyurus bonariensis', conservation: { status: 'regulated', minSize: 28, note: 'Tamanho mínimo recomendado: 28 cm. Espécie de água doce do Río de la Plata e Río Uruguay; diferente da corvina de rio (Plagioscion) e das corvinas costeiras.' }, color: '#818cf8', size: '20-45 cm', diet: 'peixes pequenos, crustáceos e insetos aquáticos', activity: 'noturna-crepuscular', habits: 'corvina exclusivamente de água doce; ocupa canais profundos do baixo Río Uruguay, Río de la Plata e o embalse do Río Negro; muito confundida com a corvina-de-rio (Plagioscion ternetzi) e com corvinas costeiras', preferences: { depth: 4.5, flow: 0.38, vegetation: 0.25, shade: 0.50, turbidity: 0.68, oxygen: 0.58, structure: 0.55, temperature: 18, solar: 10 } },
].sort((a, b) => a.name.localeCompare(b.name, 'pt'));

function spName(sp, lang) {
  if (!sp) return '';
  if (lang === 'pt') return sp.namePt || sp.name;
  if (lang === 'es') return sp.nameEs || sp.name;
  if (lang === 'en') return sp.nameEn || sp.name;
  return sp.namePt || sp.name;
}

// ── Áreas Protegidas do Uruguai — SNAP (Sistema Nacional de Áreas Protegidas) ──
// Fonte: MVOTMA / SNAP — Lei 17.234/2000
// category: 'parque_nacional' | 'paisaje_protegido' | 'monumento_natural' | 'area_manejo' | 'reserva_recursos' | 'zona_captacao'
// polygon: coordenadas reais ou aproximadas (lat/lon)
const SNAP_AREAS = [
  // ── Polígonos reais (digitalizados) ─────────────────────────────────────────
  {
    id: 'snap_humedales_santa_lucia',
    name: 'Humedales del Santa Lucía',
    category: 'reserva_recursos',
    department: 'Canelones / Montevideo / San José',
    center: [-34.665, -56.378],
    areaHa: 22000,
    description: 'Banhados, campos inundáveis e mata ciliar na bacia baixa do Río Santa Lucía. Principal manancial de Montevidéu.',
    relevance: 'Tararira, boga, dourado e pejerrey. Zona de pesca do Santa Lucía.',
    polygon: [
      [-34.720, -56.380], [-34.740, -56.380], [-34.760, -56.350],
      [-34.760, -56.300], [-34.745, -56.280], [-34.720, -56.290],
      [-34.710, -56.320], [-34.720, -56.380]
    ],
  },
  {
    id: 'snap_isla_brujas',
    name: 'Área Natural Isla de las Brujas',
    category: 'area_manejo',
    department: 'Canelones',
    center: [-34.695, -56.298],
    areaHa: 45,
    description: 'Ilha fluvial com vegetação ripária nativa. Restrições de pesca em época reprodutiva.',
    relevance: 'Zona de restrição sazonal — boga e tararira em desova.',
    polygon: [
      [-34.690, -56.310], [-34.700, -56.310], [-34.705, -56.290],
      [-34.695, -56.285], [-34.685, -56.295], [-34.690, -56.310]
    ],
  },
  {
    id: 'snap_paso_severino',
    name: 'Reservatório Paso Severino',
    category: 'zona_captacao',
    department: 'Florida',
    center: [-34.448, -56.038],
    areaHa: 1800,
    description: 'Principal reservatório de água potável do Uruguai. Pesca regulamentada por autorização especial da OSE.',
    relevance: 'Pesca somente com autorização especial — consulte a OSE.',
    polygon: [
      [-34.430, -56.050], [-34.450, -56.070], [-34.470, -56.050],
      [-34.460, -56.020], [-34.440, -56.010], [-34.425, -56.030],
      [-34.430, -56.050]
    ],
  },
  {
    id: 'snap_aguas_corrientes',
    name: 'Zona de Captação — Aguas Corrientes',
    category: 'zona_captacao',
    department: 'Canelones',
    center: [-34.493, -56.082],
    areaHa: 320,
    description: 'Área de captação de água para abastecimento de Montevidéu. Atividades regulamentadas pela OSE.',
    relevance: 'Acesso e pesca regulamentados — área de captação hídrica.',
    polygon: [
      [-34.480, -56.095], [-34.500, -56.100], [-34.510, -56.080],
      [-34.500, -56.065], [-34.480, -56.070], [-34.475, -56.085],
      [-34.480, -56.095]
    ],
  },
  // ── Polígonos aproximados (geometria baseada em características reais) ───────
  {
    id: 'snap_quebrada_cuervos',
    name: 'Quebrada de los Cuervos',
    category: 'paisaje_protegido',
    department: 'Treinta y Tres',
    center: [-33.068, -54.495],
    areaHa: 4413,
    description: 'Vale fluvial com mata ribeirinha subtropical, cascatas e fauna silvestre. Primeira área incorporada ao SNAP (2008).',
    relevance: 'Arroyo de los Cuervos — habitat de peixes de corredeira.',
    // Polígono alongado NE-SW seguindo o vale do Yerbal Chico
    polygon: [
      [-33.035, -54.465], [-33.045, -54.445], [-33.065, -54.435],
      [-33.085, -54.440], [-33.100, -54.460], [-33.105, -54.490],
      [-33.100, -54.520], [-33.085, -54.545], [-33.065, -54.555],
      [-33.045, -54.545], [-33.030, -54.520], [-33.025, -54.490],
      [-33.035, -54.465]
    ],
  },
  {
    id: 'snap_valle_lunarejo',
    name: 'Valle del Lunarejo',
    category: 'paisaje_protegido',
    department: 'Rivera',
    center: [-31.125, -56.025],
    areaHa: 23800,
    description: 'Sistema de coxilhas e vales com mata ciliar densa do norte do Uruguai. Rico em biodiversidade de aves e peixes.',
    relevance: 'Nascentes de afluentes do Río Uruguay — dourado e boga.',
    // Polígono irregular representando sistema de coxilhas (elongado NNE-SSW)
    polygon: [
      [-30.980, -56.180], [-31.020, -56.220], [-31.080, -56.200],
      [-31.140, -56.150], [-31.220, -56.080], [-31.280, -56.020],
      [-31.320, -55.950], [-31.280, -55.880], [-31.220, -55.850],
      [-31.140, -55.870], [-31.060, -55.920], [-30.980, -56.000],
      [-30.940, -56.080], [-30.920, -56.140], [-30.980, -56.180]
    ],
  },
  {
    id: 'snap_chamanga',
    name: 'Localidad Rupestre de Chamangá',
    category: 'paisaje_protegido',
    department: 'Flores',
    center: [-33.778, -56.695],
    areaHa: 988,
    description: 'Sítio arqueológico com arte rupestre pré-colombiana em contexto de campo natural e serranias.',
    relevance: 'Próximo ao Río Chamangá — habitat de tararira e cascudo.',
    // Polígono irregular para sítio arqueológico em serranias
    polygon: [
      [-33.750, -56.730], [-33.790, -56.740], [-33.810, -56.710],
      [-33.805, -56.670], [-33.775, -56.650], [-33.745, -56.660],
      [-33.735, -56.690], [-33.740, -56.720], [-33.750, -56.730]
    ],
  },
  {
    id: 'snap_laguna_rocha',
    name: 'Laguna de Rocha',
    category: 'paisaje_protegido',
    department: 'Rocha',
    center: [-34.258, -53.868],
    areaHa: 3843,
    description: 'Lagoa costeira com barra intermitente ao Atlântico. Ecossistema de transição dulcícola-marinha de alta produtividade.',
    relevance: 'Corvina, linguado, pescadinha, lisa e lacha entram pela barra.',
    // Polígono ovalado representando lagoa costeira (orientado SE-NW)
    polygon: [
      [-34.200, -53.920], [-34.220, -53.940], [-34.250, -53.950],
      [-34.280, -53.940], [-34.310, -53.920], [-34.320, -53.880],
      [-34.310, -53.840], [-34.290, -53.810], [-34.260, -53.795],
      [-34.230, -53.800], [-34.210, -53.820], [-34.195, -53.860],
      [-34.190, -53.890], [-34.200, -53.920]
    ],
  },
  {
    id: 'snap_paso_centurion',
    name: 'Paso Centurión y Sierra de Ríos',
    category: 'paisaje_protegido',
    department: 'Cerro Largo',
    center: [-32.975, -53.665],
    areaHa: 18000,
    description: 'Serra com floresta subtropical e campo natural próximo à fronteira com o Brasil. Alta riqueza de anfíbios e répteis.',
    relevance: 'Nascentes do Río Jaguarão — Austrolebias e Crenicichla.',
    // Polígono representando sistema serrano na fronteira (irregular, alongado)
    polygon: [
      [-32.820, -53.780], [-32.860, -53.820], [-32.920, -53.810],
      [-32.980, -53.780], [-33.040, -53.720], [-33.100, -53.640],
      [-33.130, -53.560], [-33.110, -53.500], [-33.060, -53.460],
      [-33.000, -53.440], [-32.940, -53.460], [-32.880, -53.520],
      [-32.820, -53.600], [-32.780, -53.680], [-32.800, -53.750],
      [-32.820, -53.780]
    ],
  },
  {
    id: 'snap_laguna_castillos',
    name: 'Laguna de Castillos',
    category: 'paisaje_protegido',
    department: 'Rocha',
    center: [-34.068, -53.768],
    areaHa: 8000,
    description: 'Lagoa costeira com floresta de palmeiras butiá. Sítio Ramsar e reserva de biosfera UNESCO.',
    relevance: 'Corvina, pejerrey, lisa e lacha quando a barra do Arroyo Valizas abre.',
    // Polígono ovalado para lagoa costeira de grande porte
    polygon: [
      [-34.000, -53.820], [-34.030, -53.850], [-34.070, -53.860],
      [-34.110, -53.840], [-34.140, -53.800], [-34.150, -53.750],
      [-34.140, -53.700], [-34.110, -53.660], [-34.070, -53.640],
      [-34.030, -53.650], [-33.990, -53.680], [-33.970, -53.730],
      [-33.975, -53.780], [-34.000, -53.820]
    ],
  },
  {
    id: 'snap_esteros_farrapos',
    name: 'Esteros de Farrapos e Islas del Río Uruguay',
    category: 'parque_nacional',
    department: 'Río Negro',
    center: [-33.068, -58.22],
    areaHa: 15000,
    description: 'Banhados fluviais, ilhas e matas no Río Uruguay. Refúgio de fauna migratória e espécies ameaçadas do litoral norte.',
    relevance: 'Habitat crítico de dourado, surubí, pacú e pira-pitã em veda.',
    // Polígono irregular representando banhados fluviais ao longo do Rio Uruguay
    polygon: [
      [-32.880, -58.380], [-32.950, -58.350], [-33.020, -58.300],
      [-33.100, -58.250], [-33.180, -58.200], [-33.220, -58.150],
      [-33.200, -58.080], [-33.150, -58.040], [-33.080, -58.060],
      [-33.000, -58.100], [-32.920, -58.150], [-32.850, -58.220],
      [-32.820, -58.300], [-32.840, -58.350], [-32.880, -58.380]
    ],
  },
  {
    id: 'snap_san_miguel',
    name: 'Parque Nacional San Miguel',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-33.665, -53.572],
    areaHa: 1800,
    description: 'Fortaleza colonial portuguesa em paisagem de campo e banhado litorâneo próximo à Laguna Merín.',
    relevance: 'Adjacente à Laguna Merín — corvina, pejerrey e savelha.',
    // Polígono para área próxima à Laguna Merín
    polygon: [
      [-33.615, -53.620], [-33.650, -53.635], [-33.705, -53.625],
      [-33.715, -53.580], [-33.695, -53.530], [-33.645, -53.515],
      [-33.595, -53.525], [-33.580, -53.570], [-33.595, -53.610],
      [-33.615, -53.620]
    ],
  },
  {
    id: 'snap_cabo_polonio',
    name: 'Parque Nacional Cabo Polonio',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-34.405, -53.778],
    areaHa: 3000,
    description: 'Cabo rochoso com dunas, floresta de restinga e colônia de lobos-marinhos. Pesca costeira ativa.',
    relevance: 'Costa atlântica — corvina branca, pescadinha e linguado.',
    // Polígono para cabo rochoso com dunas
    polygon: [
      [-34.340, -53.850], [-34.380, -53.870], [-34.440, -53.865],
      [-34.480, -53.830], [-34.470, -53.780], [-34.430, -53.730],
      [-34.370, -53.720], [-34.320, -53.750], [-34.310, -53.800],
      [-34.330, -53.830], [-34.340, -53.850]
    ],
  },
  {
    id: 'snap_isla_flores',
    name: 'Isla de Flores',
    category: 'parque_nacional',
    department: 'Montevideo',
    center: [-34.942, -56.322],
    areaHa: 28,
    description: 'Ilha no Río de la Plata com farol histórico e colônias de aves marinhas. Zona de exclusão de pesca.',
    relevance: 'Área de proteção — corvina branca e pescadilla no entorno.',
    // Polígono pequeno para ilha no Río de la Plata
    polygon: [
      [-34.935, -56.330], [-34.948, -56.333], [-34.950, -56.320],
      [-34.945, -56.310], [-34.938, -56.312], [-34.935, -56.320],
      [-34.935, -56.330]
    ],
  },
  {
    id: 'snap_humedales_hum',
    name: 'Humedales e Islas del Hum',
    category: 'parque_nacional',
    department: 'Soriano',
    center: [-33.478, -58.312],
    areaHa: 7200,
    description: 'Banhados e ilhas fluviais no Río Uruguay em Soriano. Incorporado ao SNAP em 2023.',
    relevance: 'Habitat de surubí, patí e boga no Río Uruguay médio.',
    // Polígono representando banhados fluviais (irregular, ao longo do rio)
    polygon: [
      [-33.380, -58.420], [-33.420, -58.380], [-33.480, -58.340],
      [-33.540, -58.300], [-33.580, -58.250], [-33.560, -58.200],
      [-33.520, -58.180], [-33.460, -58.220], [-33.400, -58.280],
      [-33.340, -58.340], [-33.320, -58.390], [-33.340, -58.440],
      [-33.380, -58.420]
    ],
  },
  {
    id: 'snap_isla_lobos',
    name: 'Isla e Islote de Lobos y su Entorno Sumergido',
    category: 'parque_nacional',
    department: 'Maldonado',
    center: [-35.017, -54.878],
    areaHa: 12750,
    description: 'Maior colônia de leões-marinhos do Atlântico Sul. Área marinha protegida com entorno submerso.',
    relevance: 'Zona marinha — não há pesca continental; corvina e pescadinha no entorno.',
    // Polígono ovalado para área marinha com ilha
    polygon: [
      [-34.820, -55.050], [-34.900, -55.080], [-35.000, -55.100],
      [-35.120, -55.090], [-35.200, -55.040], [-35.220, -54.960],
      [-35.200, -54.880], [-35.140, -54.800], [-35.040, -54.750],
      [-34.920, -54.760], [-34.840, -54.820], [-34.780, -54.900],
      [-34.780, -54.980], [-34.820, -55.050]
    ],
  },
  {
    id: 'snap_arequita',
    name: 'Parque Nacional Arequita',
    category: 'parque_nacional',
    department: 'Lavalleja',
    center: [-33.995, -55.325],
    areaHa: 452,
    description: 'Formações rochosas basálticas, mata nativa e campo serrano. Incorporado ao SNAP em 2024.',
    relevance: 'Arroios de serras — Australoheros, Crenicichla e Heptapterus.',
    // Polígono para serra com formações rochosas
    polygon: [
      [-33.960, -55.360], [-33.990, -55.370], [-34.030, -55.360],
      [-34.050, -55.330], [-34.040, -55.290], [-34.010, -55.270],
      [-33.970, -55.275], [-33.950, -55.300], [-33.945, -55.335],
      [-33.960, -55.360]
    ],
  },
  {
    id: 'snap_laguna_negra',
    name: 'Laguna Negra',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-33.878, -53.562],
    areaHa: 43000,
    description: 'Grande lagoa costeira de água doce com banhados e restinga. Alta diversidade de aves aquáticas.',
    relevance: 'Tararira, boga, Austrolebias e pejerrey. Próxima à Laguna Merín.',
    // Polígono ovalado irregular para grande lagoa costeira
    polygon: [
      [-33.720, -53.680], [-33.780, -53.720], [-33.850, -53.740],
      [-33.920, -53.730], [-33.980, -53.700], [-34.030, -53.650],
      [-34.060, -53.580], [-34.050, -53.500], [-34.010, -53.430],
      [-33.950, -53.390], [-33.880, -53.380], [-33.810, -53.400],
      [-33.750, -53.450], [-33.700, -53.520], [-33.680, -53.600],
      [-33.700, -53.660], [-33.720, -53.680]
    ],
  },
  {
    id: 'snap_grutas_palacio',
    name: 'Grutas del Palacio',
    category: 'monumento_natural',
    department: 'Flores',
    center: [-33.398, -56.728],
    areaHa: 103,
    description: 'Formação rochosa de arenito com grutas naturais. Monumento geológico de raro valor paisagístico.',
    relevance: 'Adjacente ao Río Chamangá — arroios com cascudo e tararira.',
    // Polígono pequeno para formação rochosa
    polygon: [
      [-33.380, -56.745], [-33.395, -56.750], [-33.410, -56.740],
      [-33.415, -56.720], [-33.405, -56.705], [-33.385, -56.705],
      [-33.375, -56.720], [-33.375, -56.740], [-33.380, -56.745]
    ],
  },
  {
    id: 'snap_laguna_garzon',
    name: 'Laguna Garzón',
    category: 'area_manejo',
    department: 'Maldonado / Rocha',
    center: [-34.618, -54.225],
    areaHa: 3400,
    description: 'Lagoa costeira intermitente com cordão arenoso. Importante zona de desova de corvinas e linguados.',
    relevance: 'Corvina, linguado, pejerrey e lisa quando a barra está aberta.',
    // Polígono alongado SE-NW para lagoa costeira
    polygon: [
      [-34.550, -54.300], [-34.580, -54.320], [-34.620, -54.330],
      [-34.660, -54.320], [-34.690, -54.290], [-34.700, -54.250],
      [-34.690, -54.200], [-34.660, -54.160], [-34.620, -54.140],
      [-34.580, -54.150], [-34.550, -54.180], [-34.540, -54.230],
      [-34.545, -54.270], [-34.550, -54.300]
    ],
  },
  {
    id: 'snap_cerro_verde',
    name: 'Cerro Verde e Islas de la Coronilla',
    category: 'area_manejo',
    department: 'Rocha',
    center: [-33.908, -53.542],
    areaHa: 7200,
    description: 'Costa rochosa com ilhotas e floresta nativa. Sítio de nidificação de aves marinhas ameaçadas.',
    relevance: 'Costa atlântica — corvina branca, pescadinha e linguado.',
    // Polígono irregular para costa rochosa com ilhotas
    polygon: [
      [-33.780, -53.680], [-33.820, -53.700], [-33.880, -53.700],
      [-33.940, -53.670], [-34.000, -53.620], [-34.040, -53.560],
      [-34.060, -53.500], [-34.040, -53.440], [-34.000, -53.400],
      [-33.940, -53.390], [-33.880, -53.410], [-33.820, -53.450],
      [-33.770, -53.510], [-33.750, -53.580], [-33.760, -53.640],
      [-33.780, -53.680]
    ],
  },
  {
    id: 'snap_rincon_franquia',
    name: 'Rincón de Franquía',
    category: 'area_manejo',
    department: 'Artigas',
    center: [-30.448, -57.712],
    areaHa: 1800,
    description: 'Banhados subtropicais no extremo norte do Uruguai, fronteira com Argentina. Fauna característica do litoral norte.',
    relevance: 'Habitat de pacú, manguruyú e pira-pitã (todos em veda absoluta).',
    // Polígono para banhados subtropicais na fronteira
    polygon: [
      [-30.380, -57.780], [-30.420, -57.800], [-30.480, -57.790],
      [-30.530, -57.750], [-30.560, -57.700], [-30.550, -57.640],
      [-30.510, -57.600], [-30.450, -57.590], [-30.390, -57.610],
      [-30.350, -57.660], [-30.340, -57.720], [-30.360, -57.770],
      [-30.380, -57.780]
    ],
  },
  {
    id: 'snap_esteros_algarrobales',
    name: 'Esteros y Algarrobales del Río Uruguay',
    category: 'area_manejo',
    department: 'Río Negro',
    center: [-33.178, -58.108],
    areaHa: 4400,
    description: 'Esteiros e algarrobais nativos na margem do Río Uruguay. Habitat de espécies do litoral.',
    relevance: 'Surubí, patí e boga. Próximo ao Embalse del Río Negro.',
    // Polígono alongado para esteiros e algarrobais
    polygon: [
      [-33.080, -58.200], [-33.120, -58.180], [-33.180, -58.160],
      [-33.240, -58.140], [-33.290, -58.100], [-33.320, -58.050],
      [-33.310, -58.000], [-33.270, -57.960], [-33.210, -57.970],
      [-33.150, -58.000], [-33.100, -58.040], [-33.060, -58.090],
      [-33.050, -58.150], [-33.080, -58.200]
    ],
  },
  {
    id: 'snap_islas_queguay',
    name: 'Islas del Queguay',
    category: 'area_manejo',
    department: 'Paysandú',
    center: [-32.245, -58.068],
    areaHa: 2300,
    description: 'Ilhas fluviais na desembocadura do Río Queguay Grande no Río Uruguay. Banhados e mata ciliar.',
    relevance: 'Dourado e surubí na confluência Queguay-Uruguay.',
    // Polígono para ilhas fluviais na confluência
    polygon: [
      [-32.180, -58.140], [-32.220, -58.150], [-32.270, -58.140],
      [-32.320, -58.110], [-32.350, -58.060], [-32.340, -58.000],
      [-32.300, -57.960], [-32.240, -57.950], [-32.180, -57.970],
      [-32.140, -58.020], [-32.130, -58.080], [-32.150, -58.130],
      [-32.180, -58.140]
    ],
  },
  {
    id: 'snap_montes_queguay',
    name: 'Montes del Queguay',
    category: 'reserva_recursos',
    department: 'Paysandú',
    center: [-32.075, -57.235],
    areaHa: 8800,
    description: 'Maior remanescente de monte nativo da ecorregião Espinal no Uruguai. Espinho-preto e algarrobo dominantes.',
    relevance: 'Rio Queguay Grande — dourado, boga e sabalito em migração.',
    // Polígono alongado para remanescente de monte nativo
    polygon: [
      [-31.920, -57.400], [-31.960, -57.420], [-32.020, -57.410],
      [-32.100, -57.380], [-32.180, -57.330], [-32.240, -57.270],
      [-32.280, -57.200], [-32.260, -57.130], [-32.200, -57.080],
      [-32.120, -57.060], [-32.040, -57.080], [-31.960, -57.120],
      [-31.900, -57.180], [-31.860, -57.250], [-31.870, -57.330],
      [-31.920, -57.400]
    ],
  },
];

// ── Dados de estoque pesqueiro DINARA ──────────────────────────────────────────
// Fonte: DINARA Boletín Estadístico Pesquero 2018, Informe Sectorial 2020-2021
// e publicações da MGAP. Atualizado: 2024. Sem API pública disponível.
// status: 'abundant' | 'stable' | 'reduced' | 'critical' | 'unknown'
const DINARA_STOCK = {
  corvina_branca: { status: 'stable',   trend: 'stable',   note: 'Principal espécie comercial do Uruguai. Estoque estável segundo capturas industriais. Monitoramento anual pela DINARA.', year: 2023 },
  pescadilla:     { status: 'stable',   trend: 'stable',   note: 'Estoque em níveis sustentáveis. Captura média anual ~4.000 t. Segue regulamentação de tamanho mínimo (27 cm).', year: 2022 },
  lisa:           { status: 'abundant', trend: 'stable',   note: 'Populações abundantes no Río de la Plata e lagoas costeiras. Pesca artesanal intensa porém sustentável.', year: 2022 },
  lacha:          { status: 'abundant', trend: 'stable',   note: 'Espécie pelágica com grandes cardumes sazonais. Importante para a cadeia trófica costeira.', year: 2022 },
  dourado:        { status: 'reduced',  trend: 'declining', note: 'Estoque reduzido por sobrepesca histórica e degradação de habitats de desova. Veda reprodutiva essencial.', year: 2021 },
  surubí:         { status: 'reduced',  trend: 'stable',   note: 'Populações reduzidas. Raramente capturado no Santa Lucía. Mais frequente no Río Uruguay.', year: 2021 },
  boga:           { status: 'stable',   trend: 'stable',   note: 'Estoque estável na bacia do Prata. Importante para pesca desportiva e artesanal.', year: 2022 },
  tararira:       { status: 'stable',   trend: 'stable',   note: 'Populações estáveis em rios e banhados. Espécie resiliente, tolerante a variações ambientais.', year: 2022 },
  pejerrey:       { status: 'stable',   trend: 'stable',   note: 'Estoque em níveis normais. Sensível a eutrofização — qualidade da água é fator limitante.', year: 2022 },
  bagre:          { status: 'stable',   trend: 'stable',   note: 'Populações estáveis. Pesca artesanal e desportiva sem pressão excessiva no Santa Lucía.', year: 2022 },
  sabalito:       { status: 'reduced',  trend: 'declining', note: 'Estoque em declínio — espécie migratória impactada por barragens e degradação de corredores fluviais.', year: 2021 },
  manguruyu:      { status: 'critical', trend: 'declining', note: 'Espécie criticamente ameaçada. Veda absoluta desde 2012. Raramente avistado. Presença indica alta qualidade ambiental.', year: 2021 },
  pacu:           { status: 'critical', trend: 'declining', note: 'Criticamente ameaçado no Uruguai. Veda absoluta. Ocorrência esporádica no extremo norte.', year: 2021 },
  pira_pita:      { status: 'critical', trend: 'declining', note: 'Criticamente ameaçado. Veda absoluta. Dependente de corredeiras preservadas para reprodução.', year: 2021 },
  patí:           { status: 'reduced',  trend: 'stable',   note: 'Populações reduzidas por sobrepesca e perda de habitat. Monitoramento limitado no Santa Lucía.', year: 2020 },
  corvina_negra:  { status: 'stable',   trend: 'stable',   note: 'Estoque estável nas lagoas costeiras e estuário. Crescimento lento — importante respeitar tamanho mínimo.', year: 2022 },
  lenguado:       { status: 'stable',   trend: 'stable',   note: 'Populações estáveis em habitats arenosos. Captura artesanal moderada.', year: 2022 },
  carpa:          { status: 'abundant', trend: 'increasing', note: 'Espécie exótica invasora em expansão. Alta densidade em reservatórios e áreas eutrofizadas. Remoção recomendada.', year: 2023 },
  austrolebias:   { status: 'reduced',  trend: 'declining', note: 'Diversas espécies ameaçadas por destruição de banhados temporários. Indicadores prioritários de conservação.', year: 2021 },
  rhamdia:        { status: 'abundant', trend: 'stable',    note: 'Bagre generalista extremamente comum em todos os sistemas hídricos do Uruguai. Sem pressão significativa de captura.', year: 2022 },
  chafalote:      { status: 'reduced',  trend: 'stable',    note: 'Predador fluvial de grande porte com populações reduzidas no Río Uruguay. Sensível a degradação de habitat e sobrepesca.', year: 2021 },
  bagre_branco:   { status: 'stable',   trend: 'stable',    note: 'Estoque estável no Río Uruguay e Río de la Plata. Importante para pesca artesanal local.', year: 2022 },
  boga_lisa:      { status: 'stable',   trend: 'stable',    note: 'Populações estáveis na bacia do Río Negro e Río Uruguay médio. Pouco estudada no Uruguai.', year: 2021 },
  pachyurus:      { status: 'stable',   trend: 'stable',    note: 'Corvina fluvial com estoque estável no Río Uruguay e embalse do Río Negro. Dados de monitoramento limitados.', year: 2021 },
  castaneta:      { status: 'stable',   trend: 'stable',    note: 'Cíclido comum nos sistemas fluviais orientais e bacia do Prata. Adaptável a diferentes habitats.', year: 2022 },
  morena:         { status: 'abundant', trend: 'stable',    note: 'Peixe elétrico endêmico do Uruguai. Abundante em banhados e zonas de vegetação densa. Indicador de habitats úmidos conservados.', year: 2022 },
  corydoras:      { status: 'abundant', trend: 'stable',    note: 'Um dos peixes mais comuns do sul do Uruguai. Presente em praticamente todos os arroios e margens de rios.', year: 2022 },
  hoplosternum:   { status: 'abundant', trend: 'stable',    note: 'Cascarudo grande muito abundante no norte e leste do Uruguai. Tolerante a baixo oxigênio; resistente a impactos ambientais.', year: 2022 },
  leporino:       { status: 'stable',   trend: 'stable',    note: 'Leporino de porte médio com populações estáveis no Río Uruguay e afluentes. Dados de monitoramento limitados no Uruguai.', year: 2021 },
};

// ── Calendário de vedas (CARU Res. 59/12 e 8/1998 · DINARA Decreto 149/997) ──
// period: { start: [mes,dia], end: [mes,dia] } — mês 1-12
// type: 'absoluta' | 'sazonal_comercial' | 'sazonal_desportiva'
const VEDAS = [
  {
    speciesId: 'manguruyu',
    type: 'absoluta',
    authority: 'CARU Res. 59/12',
    note: 'Proibida em qualquer época, modalidade e tamanho.',
  },
  {
    speciesId: 'pacu',
    type: 'absoluta',
    authority: 'CARU Res. 59/12',
    note: 'Proibida em qualquer época, modalidade e tamanho.',
  },
  {
    speciesId: 'pira_pita',
    type: 'absoluta',
    authority: 'CARU Res. 59/12',
    note: 'Proibida em qualquer época, modalidade e tamanho.',
  },
  {
    speciesId: 'dourado',
    type: 'sazonal_desportiva',
    period: { start: [9, 1], end: [12, 31] },
    authority: 'CARU Res. 59/12',
    note: 'Veda de pesca comercial e desportiva de 1° de setembro a 31 de dezembro.',
  },
  {
    speciesId: 'surubí',
    type: 'sazonal_desportiva',
    period: { start: [8, 15], end: [3, 15] },
    authority: 'CARU Res. 59/12',
    note: 'Veda de 15 de agosto a 15 de março (período reprodutivo do surubí pintado). Talla mínima: 85 cm (longitud estándar). O surubí atigrado (P. fasciatum) tem veda absoluta permanente.',
  },
  {
    speciesId: 'armado',
    type: 'absoluta',
    authority: 'CARU Res. 59/12',
    note: 'Veda absoluta permanente para todas as espécies de armado no Río Uruguay: Pterodoras granulosus, Oxydoras kneri, Rhinodoras dorbignyi e Megalodoras laevigatulus. Devolver imediatamente ao rio.',
  },
];

// Retorna o status de veda de uma espécie para uma data
function getVedaStatus(speciesId, date = new Date()) {
  const vedas = VEDAS.filter(v => v.speciesId === speciesId);
  if (!vedas.length) return null;

  const absVeda = vedas.find(v => v.type === 'absoluta');
  if (absVeda) return { active: true, type: 'absoluta', veda: absVeda, daysLeft: null, daysUntil: null };

  const m = date.getMonth() + 1; // 1-12
  const d = date.getDate();
  const dayOfYear = n => (n[0] - 1) * 30.5 + n[1]; // aproximação para comparação

  for (const veda of vedas) {
    if (!veda.period) continue;
    const { start, end } = veda.period;
    const cur = dayOfYear([m, d]);
    const s = dayOfYear(start);
    const e = dayOfYear(end);

    let active = false;
    if (s <= e) {
      active = cur >= s && cur <= e;
    } else {
      active = cur >= s || cur <= e;
    }

    if (active) {
      // dias restantes até o fim
      let endDate = new Date(date.getFullYear(), end[0] - 1, end[1]);
      if (endDate < date) endDate.setFullYear(endDate.getFullYear() + 1);
      const daysLeft = Math.ceil((endDate - date) / 86400000);
      return { active: true, type: veda.type, veda, daysLeft, daysUntil: null };
    }

    // dias até o próximo início
    let startDate = new Date(date.getFullYear(), start[0] - 1, start[1]);
    if (startDate < date) startDate.setFullYear(startDate.getFullYear() + 1);
    const daysUntil = Math.ceil((startDate - date) / 86400000);
    if (daysUntil <= 30) {
      return { active: false, type: veda.type, veda, daysLeft: null, daysUntil };
    }
  }
  return null;
}

// Retorna todas as vedas com status atual, para o card calendário
function getVedasAtivas(date = new Date()) {
  return VEDAS.map(veda => {
    const sp = species.find(s => s.id === veda.speciesId);
    const status = getVedaStatus(veda.speciesId, date);
    return { veda, sp, status };
  }).filter(({ sp }) => sp);
}

// (SNAP_AREAS definido acima — ver bloco antes das VEDAS)
const _SNAP_UNUSED = [
  {
    id: 'snap_quebrada_cuervos',
    name: 'Quebrada de los Cuervos',
    category: 'paisaje_protegido',
    department: 'Treinta y Tres',
    center: [-33.068, -54.495],
    areaHa: 4413,
    description: 'Vale fluvial com mata ribeirinha subtropical, cascatas e fauna silvestre. Primeira área incorporada ao SNAP (2008).',
    relevance: 'Arroyo de los Cuervos — habitat de peixes de corredeira.',
  },
  {
    id: 'snap_valle_lunarejo',
    name: 'Valle del Lunarejo',
    category: 'paisaje_protegido',
    department: 'Rivera',
    center: [-31.125, -56.025],
    areaHa: 23800,
    description: 'Sistema de coxilhas e vales com mata ciliar densa do norte do Uruguai. Rico em biodiversidade de aves e peixes.',
    relevance: 'Nascentes de afluentes do Río Uruguay — dourado e boga.',
  },
  {
    id: 'snap_chamanga',
    name: 'Localidad Rupestre de Chamangá',
    category: 'paisaje_protegido',
    department: 'Flores',
    center: [-33.778, -56.695],
    areaHa: 988,
    description: 'Sítio arqueológico com arte rupestre pré-colombiana em contexto de campo natural e serranias.',
    relevance: 'Próximo ao Río Chamangá — habitat de tararira e cascudo.',
  },
  {
    id: 'snap_laguna_rocha',
    name: 'Laguna de Rocha',
    category: 'paisaje_protegido',
    department: 'Rocha',
    center: [-34.258, -53.868],
    areaHa: 3843,
    description: 'Lagoa costeira com barra intermitente ao Atlântico. Ecossistema de transição dulcícola-marinha de alta produtividade.',
    relevance: 'Corvina, linguado, pescadinha, lisa e lacha entram pela barra.',
  },
  {
    id: 'snap_paso_centurion',
    name: 'Paso Centurión y Sierra de Ríos',
    category: 'paisaje_protegido',
    department: 'Cerro Largo',
    center: [-32.975, -53.665],
    areaHa: 18000,
    description: 'Serra com floresta subtropical e campo natural próximo à fronteira com o Brasil. Alta riqueza de anfíbios e répteis.',
    relevance: 'Nascentes do Río Jaguarão — Austrolebias e Crenicichla.',
  },
  {
    id: 'snap_esteros_farrapos',
    name: 'Esteros de Farrapos e Islas del Río Uruguay',
    category: 'parque_nacional',
    department: 'Río Negro',
    center: [-33.068, -58.22],
    areaHa: 15000,
    description: 'Banhados fluviais, ilhas e matas no Río Uruguay. Refúgio de fauna migratória e espécies ameaçadas do litoral norte.',
    relevance: 'Habitat crítico de dourado, surubí, pacú e pira-pitã em veda.',
  },
  {
    id: 'snap_san_miguel',
    name: 'Parque Nacional San Miguel',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-33.665, -53.572],
    areaHa: 1800,
    description: 'Fortaleza colonial portuguesa em paisagem de campo e banhado litorâneo próximo à Laguna Merín.',
    relevance: 'Adjacente à Laguna Merín — corvina, pejerrey e savelha.',
  },
  {
    id: 'snap_cabo_polonio',
    name: 'Parque Nacional Cabo Polonio',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-34.405, -53.778],
    areaHa: 3000,
    description: 'Cabo rochoso com dunas, floresta de restinga e colônia de lobos-marinhos. Pesca costeira ativa.',
    relevance: 'Costa atlântica — corvina branca, pescadinha e linguado.',
  },
  {
    id: 'snap_isla_flores',
    name: 'Isla de Flores',
    category: 'parque_nacional',
    department: 'Montevideo',
    center: [-34.942, -56.322],
    areaHa: 28,
    description: 'Ilha no Río de la Plata com farol histórico e colônias de aves marinhas. Zona de exclusão de pesca.',
    relevance: 'Área de proteção — corvina branca e pescadilla no entorno.',
  },
  {
    id: 'snap_humedales_hum',
    name: 'Humedales e Islas del Hum',
    category: 'parque_nacional',
    department: 'Soriano',
    center: [-33.478, -58.312],
    areaHa: 7200,
    description: 'Banhados e ilhas fluviais no Río Uruguay em Soriano. Incorporado ao SNAP em 2023.',
    relevance: 'Habitat de surubí, patí e boga no Río Uruguay médio.',
  },
  {
    id: 'snap_isla_lobos',
    name: 'Isla e Islote de Lobos y su Entorno Sumergido',
    category: 'parque_nacional',
    department: 'Maldonado',
    center: [-35.017, -54.878],
    areaHa: 12750,
    description: 'Maior colônia de leões-marinhos do Atlântico Sul. Área marinha protegida com entorno submerso.',
    relevance: 'Zona marinha — não há pesca continental; corvina e pescadinha no entorno.',
  },
  {
    id: 'snap_arequita',
    name: 'Parque Nacional Arequita',
    category: 'parque_nacional',
    department: 'Lavalleja',
    center: [-33.995, -55.325],
    areaHa: 452,
    description: 'Formações rochosas basálticas, mata nativa e campo serrano. Incorporado ao SNAP em 2024.',
    relevance: 'Arroios de serras — Australoheros, Crenicichla e Heptapterus.',
  },
  {
    id: 'snap_laguna_negra',
    name: 'Laguna Negra',
    category: 'parque_nacional',
    department: 'Rocha',
    center: [-33.878, -53.562],
    areaHa: 43000,
    description: 'Grande lagoa costeira de água doce com banhados e restinga. Alta diversidade de aves aquáticas.',
    relevance: 'Tararira, boga, Austrolebias e pejerrey. Próxima à Laguna Merín.',
  },
  {
    id: 'snap_grutas_palacio',
    name: 'Grutas del Palacio',
    category: 'monumento_natural',
    department: 'Flores',
    center: [-33.398, -56.728],
    areaHa: 103,
    description: 'Formação rochosa de arenito com grutas naturais. Monumento geológico de raro valor paisagístico.',
    relevance: 'Adjacente ao Río Chamangá — arroios com cascudo e tararira.',
  },
  {
    id: 'snap_laguna_garzon',
    name: 'Laguna Garzón',
    category: 'area_manejo',
    department: 'Maldonado / Rocha',
    center: [-34.618, -54.225],
    areaHa: 3400,
    description: 'Lagoa costeira intermitente com cordão arenoso. Importante zona de desova de corvinas e linguados.',
    relevance: 'Corvina, linguado, pejerrey e lisa quando a barra está aberta.',
  },
  {
    id: 'snap_cerro_verde',
    name: 'Cerro Verde e Islas de la Coronilla',
    category: 'area_manejo',
    department: 'Rocha',
    center: [-33.908, -53.542],
    areaHa: 7200,
    description: 'Costa rochosa com ilhotas e floresta nativa. Sítio de nidificação de aves marinhas ameaçadas.',
    relevance: 'Costa atlântica — corvina branca, pescadinha e linguado.',
  },
  {
    id: 'snap_rincon_franquia',
    name: 'Rincón de Franquía',
    category: 'area_manejo',
    department: 'Artigas',
    center: [-30.448, -57.712],
    areaHa: 1800,
    description: 'Banhados subtropicais no extremo norte do Uruguai, fronteira com Argentina. Fauna característica do litoral norte.',
    relevance: 'Habitat de pacú, manguruyú e pira-pitã (todos em veda absoluta).',
  },
  {
    id: 'snap_esteros_algarrobales',
    name: 'Esteros y Algarrobales del Río Uruguay',
    category: 'area_manejo',
    department: 'Río Negro',
    center: [-33.178, -58.108],
    areaHa: 4400,
    description: 'Esteiros e algarrobais nativos na margem do Río Uruguay. Habitat de espécies do litoral.',
    relevance: 'Surubí, patí e boga. Próximo ao Embalse del Río Negro.',
  },
  {
    id: 'snap_islas_queguay',
    name: 'Islas del Queguay',
    category: 'area_manejo',
    department: 'Paysandú',
    center: [-32.245, -58.068],
    areaHa: 2300,
    description: 'Ilhas fluviais na desembocadura do Río Queguay Grande no Río Uruguay. Banhados e mata ciliar.',
    relevance: 'Dourado e surubí na confluência Queguay-Uruguay.',
  },
  {
    id: 'snap_montes_queguay',
    name: 'Montes del Queguay',
    category: 'reserva_recursos',
    department: 'Paysandú',
    center: [-32.075, -57.235],
    areaHa: 8800,
    description: 'Maior remanescente de monte nativo da ecorregião Espinal no Uruguai. Espinho-preto e algarrobo dominantes.',
    relevance: 'Rio Queguay Grande — dourado, boga e sabalito em migração.',
  },
  {
    id: 'snap_humedales_santa_lucia',
    name: 'Humedales del Santa Lucía',
    category: 'reserva_recursos',
    department: 'Canelones / Montevideo / San José',
    center: [-34.665, -56.378],
    areaHa: 22000,
    description: 'Banhados, campos inundáveis e mata ciliar na bacia baixa do Río Santa Lucía. Principal manancial de Montevidéu.',
    relevance: 'Tararira, boga, dourado e pejerrey. Zona de pesca do Santa Lucía.',
  },
];
// ── Espécies disponíveis por tipo de curso d'água ──
const SPECIES_BY_WATERCOURSE = {
  // Rios interiores — ecorregião Paraná Inferior (Santa Lucía, San José, Rosario)
  rio:         ['tararira','dourado','boga','bagre','pejerrey','mojarra','sabalito','patí','surubí','vieja_agua','palometa','armado','corvina','anguilas','carpa','dientudo','tachuela','rhamdia','bagre_branco','boga_lisa','castaneta','hoplosternum'],
  // Rios do litoral norte — ecorregião Uruguai Inferior (Cuareim, Arapey, Daymán, Queguay, Tacuarembó...)
  // Fauna mais rica: dourado, surubí, manguruyu, pacú, pira-pitã, chafalote
  rio_norte:   ['dourado','surubí','manguruyu','pacu','pira_pita','boga','sabalito','patí','bagre','tararira','pejerrey','mojarra','armado','vieja_agua','dientudo','palometa','carpa','chafalote','bagre_branco','boga_lisa','rhamdia','leporino','hoplosternum'],
  // Rios da bacia do Río Negro (Tacuarembó, Caraguata, Yí, Negro)
  rio_negro:   ['dourado','boga','bagre','tararira','sabalito','patí','surubí','pejerrey','mojarra','armado','vieja_agua','dientudo','palometa','crenicichla','gymnogeophagus','carpa','rhamdia','boga_lisa','pachyurus','castaneta','hoplosternum'],
  // Rios orientais — ecorregião Laguna dos Patos (Cebollatí, Olimar, Tacuarí, Jaguarão, India Muerta)
  // Endemismos: Austrolebias, Gymnogeophagus, Crenicichla punctata, Geophagus brasiliensis
  rio_patos:   ['tararira','boga','bagre','sabalito','dourado','patí','pejerrey','mojarra','dientudo','crenicichla','gymnogeophagus','austrolebias','heptapterus','bryconamericus','anguilas','tachuela','vieja_agua','rhamdia','corydoras','castaneta','morena','hoplosternum'],
  // Arroios — afluentes de média e pequena ordem (bacia Santa Lucía e interior)
  arroio:      ['tararira','mojarra','boga','bagre','anguilas','dientudo','tachuela','australoheros','gymnogeophagus','crenicichla','jenynsia','cnesterodon','rineloricaria','bryconamericus','heptapterus','vieja_agua','rhamdia','corydoras','castaneta','morena','hoplosternum'],
  // Arroios urbanos degradados (Montevidéu: Carrasco, Miguelete, Pantanoso)
  arroio_urbano: ['tararira','carpa','anguilas','jenynsia','cnesterodon','mojarra','tachuela','rhamdia'],
  canada:      ['tararira','mojarra','anguilas','tachuela','jenynsia','cnesterodon','bryconamericus','australoheros','heptapterus','rhamdia','corydoras','morena','hoplosternum'],
  quebrada:    ['tararira','mojarra','anguilas','tachuela','jenynsia','cnesterodon','rhamdia','corydoras'],
  canal:       ['anguilas','carpa','rhamdia','morena'],
  // Lagoas costeiras — ecorregião Laguna dos Patos (Garzón, Rocha, Castillos, José Ignacio, Merín, Negra)
  // Espécies entram quando a barra abre ao oceano Atlântico
  lagoon:      ['corvina_negra','corvina_branca','lenguado','lisa','lacha','pejerrey','pescadilla','tararira','bagre','boga','carpa','anguilas','sabalito','austrolebias','rhamdia','corydoras','morena','hoplosternum'],
  // Arroios costeiros com influência estuarina (Solís Grande, Pando, Maldonado, Valizas...)
  estuario:    ['corvina_branca','corvina_negra','lisa','pejerrey','buricheta','pescadilla','lenguado','lacha','tararira','bagre','dientudo','mojarra','boga','bagre_branco','pachyurus'],
  // ── RS: Bacia do Jacuí e afluentes (Vacacaí, Santa Maria, Ibicuí, Taquari, Antas...)
  // Fauna representativa: dourado, grumatã, mandi, cará, traíra, piava, pintado
  rio_jacui:   ['dourado','boga','bagre','tararira','sabalito','patí','surubí','pejerrey','mojarra','crenicichla','gymnogeophagus','pacu','chafalote','rhamdia','bryconamericus','heptapterus','corydoras','hoplosternum'],
  // RS: Lagoa dos Patos e canais internos (Guaíba, canal São Gonçalo)
  // Ambiente lagunar de água doce com influência marinha na embocadura
  lagoa_patos: ['corvina_negra','corvina_branca','tainha','bagre','tararira','boga','sabalito','pejerrey','lisa','lacha','dourado','crenicichla','gymnogeophagus','austrolebias','rhamdia','corydoras','hoplosternum'],
  // RS: Rio Camaquã e afluentes (Camaquã de Cima, Camaquã do Sul)
  rio_camaqua:  ['dourado','tararira','boga','bagre','sabalito','crenicichla','gymnogeophagus','austrolebias','bryconamericus','rhamdia','corydoras','hoplosternum'],
  // RS: Arroios gaúchos (afluentes menores do RS)
  arroio_rs:    ['tararira','mojarra','boga','bagre','crenicichla','gymnogeophagus','austrolebias','bryconamericus','jenynsia','heptapterus','rhamdia','corydoras','hoplosternum'],
};

// Espécies com peixes grandes (≥3 kg tipicamente)
const BIG_FISH_SPECIES = new Set(['dourado','patí','surubí','boga','sabalito','carpa','tararira','armado','corvina_negra','corvina_branca','lisa','lenguado','manguruyu','pacu','pira_pita','chafalote','bagre_branco','pachyurus']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function closeness(value, target, tolerance) {
  return clamp(1 - Math.abs(value - target) / tolerance, 0, 1);
}

function activityScore(activity, hour) {
  const isCrepuscular = (hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 19);
  const isDay = hour > 8 && hour < 17;
  const isNight = hour >= 20 || hour < 6;

  if (activity === 'crepuscular') return isCrepuscular ? 1 : isDay ? 0.52 : 0.64;
  if (activity === 'noturna-crepuscular') return isNight ? 1 : isCrepuscular ? 0.86 : 0.34;
  if (activity === 'diurna-crepuscular') return isCrepuscular ? 1 : isDay ? 0.82 : 0.34;
  return isDay ? 1 : isCrepuscular ? 0.72 : 0.28;
}

function calibrationBonus(occurrenceCount) {
  if (occurrenceCount <= 0) return 0;
  return Math.min(12, Math.log2(occurrenceCount + 1) * 4);
}

function dischargeModifier(discharge, avg30, flowPreference) {
  if (discharge == null || avg30 == null || avg30 <= 0) return 0;

  const ratio = discharge / avg30;

  if (ratio > 3.0) return -8;
  if (ratio > 2.0) return flowPreference > 0.6 ? 2 : -5;
  if (ratio > 1.4) return flowPreference > 0.5 ? 3 : -2;
  if (ratio >= 0.7) return 0;
  if (ratio >= 0.4) return flowPreference < 0.4 ? 2 : -3;
  return flowPreference < 0.4 ? 1 : -6;
}

// Ajusta parâmetros heurísticos baseado no tipo de curso d'água
function getHabitatMultipliers(watercourseType = 'rio') {
  const multipliers = {
    // Rio principal (Santa Lúcia) - equilibrado
    rio: {
      depth: 1.0,
      flow: 1.0,
      vegetation: 1.0,
      shade: 1.0,
      turbidity: 1.0,
      oxygen: 1.0,
      structure: 1.0,
      weightDepth: 18,
      weightFlow: 13,
      weightVegetation: 13,
      weightShade: 8,
      weightTurbidity: 8,
      weightOxygen: 11,
      weightStructure: 11
    },
    // Arroio - mais raso, fluxo variável, menos estrutura
    arroio: {
      depth: 0.7,          // Mais raso
      flow: 1.2,           // Fluxo mais rápido (menor volume)
      vegetation: 0.9,     // Vegetação similar
      shade: 1.1,          // Mais sombra (córregos arborizados)
      turbidity: 0.8,      // Menos turbulento
      oxygen: 1.1,         // Mais oxigênio (água renovada)
      structure: 0.6,      // Menos estrutura subaquática
      weightDepth: 12,
      weightFlow: 18,
      weightVegetation: 14,
      weightShade: 10,
      weightTurbidity: 6,
      weightOxygen: 14,
      weightStructure: 7
    },
    // Canadá - calmo, profundo, vegetação abundante
    canada: {
      depth: 1.3,          // Mais profundo
      flow: 0.3,           // Fluxo mínimo (água parada)
      vegetation: 1.4,     // Vegetação densa
      shade: 1.2,          // Sombra significativa
      turbidity: 0.6,      // Água clara
      oxygen: 0.7,        // Menos oxigênio (água parada)
      structure: 1.1,      // Boa estrutura
      weightDepth: 20,
      weightFlow: 4,
      weightVegetation: 18,
      weightShade: 12,
      weightTurbidity: 5,
      weightOxygen: 6,
      weightStructure: 14
    },
    // Stream - rápido, oxigenado, estrutura rochosa
    stream: {
      depth: 0.5,          // Raso
      flow: 1.5,           // Fluxo rápido
      vegetation: 0.7,     // Menos vegetação aquatica
      shade: 0.9,          // Menos sombra
      turbidity: 0.9,      // Moderada turbulência
      oxygen: 1.3,        // Altamente oxigenado
      structure: 0.8,      // Estrutura rochosa
      weightDepth: 10,
      weightFlow: 20,
      weightVegetation: 10,
      weightShade: 6,
      weightTurbidity: 8,
      weightOxygen: 18,
      weightStructure: 9
    },
    // Rio norte — ecorregião Uruguai Inferior (Cuareim, Arapey, Daymán, Queguay...)
    // Grandes rios com corredeiras, alta oxigenação, dourado e surubí
    rio_norte: {
      depth: 1.3,
      flow: 1.3,
      vegetation: 0.8,
      shade: 0.7,
      turbidity: 1.1,
      oxygen: 1.2,
      structure: 0.9,
      weightDepth: 20,
      weightFlow: 18,
      weightVegetation: 8,
      weightShade: 6,
      weightTurbidity: 9,
      weightOxygen: 15,
      weightStructure: 10
    },
    // Rio Negro — ecorregião Uruguai Inferior sub-bacia (Río Negro, Yi, Tacuarembó, Caraguatá)
    // Rios regulados por barragens, profundos, boa diversidade
    rio_negro: {
      depth: 1.2,
      flow: 1.0,
      vegetation: 0.9,
      shade: 0.8,
      turbidity: 1.0,
      oxygen: 1.0,
      structure: 1.0,
      weightDepth: 18,
      weightFlow: 14,
      weightVegetation: 10,
      weightShade: 7,
      weightTurbidity: 8,
      weightOxygen: 13,
      weightStructure: 11
    },
    // Rio Patos — ecorregião Laguna dos Patos (Cebollatí, Olimar, Tacuarí, Jaguarão...)
    // Rios de planície com endemismos, Austrolebias, água mais clara
    rio_patos: {
      depth: 0.9,
      flow: 0.8,
      vegetation: 1.2,
      shade: 1.1,
      turbidity: 0.7,
      oxygen: 1.1,
      structure: 1.1,
      weightDepth: 14,
      weightFlow: 10,
      weightVegetation: 16,
      weightShade: 10,
      weightTurbidity: 6,
      weightOxygen: 13,
      weightStructure: 13
    },
    // Arroio urbano — Carrasco, Miguelete, Pantanoso (Montevidéu)
    // Fauna empobrecida, alta poluição, carpa e tararira dominam
    arroio_urbano: {
      depth: 0.6,
      flow: 0.9,
      vegetation: 0.6,
      shade: 0.8,
      turbidity: 1.5,
      oxygen: 0.6,
      structure: 0.5,
      weightDepth: 10,
      weightFlow: 12,
      weightVegetation: 8,
      weightShade: 6,
      weightTurbidity: 16,
      weightOxygen: 8,
      weightStructure: 7
    },
    // Lagoa costeira — Garzón, Rocha, Castillos, José Ignacio, Merín, Negra
    // Águas calmas, salinidade variável, fauna mista dulcícola/marinha
    lagoon: {
      depth: 1.1,
      flow: 0.4,
      vegetation: 1.1,
      shade: 0.7,
      turbidity: 1.2,
      oxygen: 1.0,
      structure: 0.7,
      weightDepth: 16,
      weightFlow: 6,
      weightVegetation: 12,
      weightShade: 6,
      weightTurbidity: 12,
      weightOxygen: 11,
      weightStructure: 8
    },
    // Estuário — Solís Grande, Pando, Maldonado, arroios costeiros
    // Influência de maré, salinidade variável, corvina e pejerrey
    estuario: {
      depth: 1.0,
      flow: 0.8,
      vegetation: 0.8,
      shade: 0.7,
      turbidity: 1.3,
      oxygen: 1.0,
      structure: 0.8,
      weightDepth: 16,
      weightFlow: 10,
      weightVegetation: 9,
      weightShade: 6,
      weightTurbidity: 14,
      weightOxygen: 12,
      weightStructure: 9
    },
    // Default para outros tipos
    default: {
      depth: 0.9,
      flow: 1.0,
      vegetation: 0.95,
      shade: 1.0,
      turbidity: 0.9,
      oxygen: 1.0,
      structure: 0.85,
      weightDepth: 16,
      weightFlow: 14,
      weightVegetation: 13,
      weightShade: 8,
      weightTurbidity: 7,
      weightOxygen: 12,
      weightStructure: 10
    }
  };
  
  return multipliers[watercourseType] || multipliers.default;
}

// Determina a zona do rio baseado na latitude (baixo curso = estuarino, alto curso = montante)
function classifyRiverZoneByLocation(center) {
  if (!center || !Array.isArray(center)) return 'mid_course';
  const lat = center[0];
  
  // Limites aproximados do Rio Santa Lúcia no Uruguai
  // Baixo curso (estuarino): < -34.8 (mais próximo do oceano)
  // Alto curso: > -33.5 (montante, mais distante do oceano)
  // Meio curso: entre -34.8 e -33.5
  
  if (lat < -34.8) {
    return 'lower_course'; // Baixo curso estuarino
  } else if (lat > -33.5) {
    return 'upper_course'; // Alto curso
  }
  return 'mid_course'; // Meio curso
}

// Calcula multiplicador sazonal baseado na zona do rio e mês atual
function getSeasonalMultiplier(zone, month = new Date().getMonth()) {
  // month: 0-11 (Jan-Dez)
  
  const seasonalPatterns = {
    // Baixo curso estuarino - influência da maré e salinidade
    lower_course: {
      // Verão (Dez-Fev): peixes buscam água doce, maré alta dificulta
      0: 0.9, 1: 0.85, 2: 0.9,    // Dez, Jan, Fev
      // Outono (Mar-Mai): melhor época, maré moderada
      3: 1.15, 4: 1.2, 5: 1.15,   // Mar, Abr, Mai
      // Inverno (Jun-Ago): peixes menos ativos, mas boa pesca
      6: 1.0, 7: 1.0, 8: 1.0,     // Jun, Jul, Ago
      // Primavera (Set-Nov): reprodução, peixes ativos
      9: 1.1, 10: 1.05, 11: 0.95   // Set, Out, Nov
    },
    
    // Alto curso - água doce, temperatura mais variável
    upper_course: {
      // Verão: água quente, peixes profundos
      0: 0.8, 1: 0.75, 2: 0.8,
      // Outono: água esfriando, peixes ativos na superfície
      3: 1.2, 4: 1.25, 5: 1.15,
      // Inverno: água fria, peixes letárgicos
      6: 0.7, 7: 0.65, 8: 0.75,
      // Primavera: desova, peixes agressivos
      9: 1.3, 10: 1.25, 11: 1.1
    },
    
    // Meio curso - características intermediárias
    mid_course: {
      // Verão
      0: 0.85, 1: 0.8, 2: 0.85,
      // Outono
      3: 1.15, 4: 1.2, 5: 1.15,
      // Inverno
      6: 0.85, 7: 0.85, 8: 0.9,
      // Primavera
      9: 1.15, 10: 1.1, 11: 1.0
    }
  };
  
  return seasonalPatterns[zone]?.[month] || 1.0;
}

// Bônus/penalidade baseado em pressão barométrica e tendência
// Referências: In-Fisherman, Kestrel Meters, Mercury Marine
// pressureSensitivity: 0.0 (insensível, ex: bagre bentônico) → 1.0 (muito sensível, ex: pejerrey, dourado)
function pressureBonus(climate, pressureSensitivity = 0.5) {
  const pressure = climate.pressure; // hPa
  const trend = climate.pressureTrend; // 'subindo' | 'caindo' | 'estável'

  if (!pressure || !trend) return 0;

  let trendScore = 0;
  // Pressão caindo = frente fria chegando → alimentação intensa (bônus)
  if (trend === 'caindo') trendScore = +8;
  // Pressão subindo após tempestade → peixes em adaptação (penalidade leve)
  else if (trend === 'subindo') trendScore = -4;
  // Pressão estável → comportamento previsível (neutro)
  else trendScore = +2;

  // Faixa ideal de pressão para água doce: 1008–1022 hPa
  let absoluteScore = 0;
  if (pressure >= 1008 && pressure <= 1022) absoluteScore = +3;       // Faixa ideal
  else if (pressure > 1022) absoluteScore = -5;                         // Muito alta → peixes no fundo
  else if (pressure < 1000) absoluteScore = -8;                         // Muito baixa → letargia
  else if (pressure >= 1000 && pressure < 1008) absoluteScore = -2;    // Abaixo do ideal

  const rawBonus = (trendScore + absoluteScore) * pressureSensitivity;
  return Math.round(rawBonus); // -8 a +8 pontos
}

function calculateProbability(segment, targetSpecies, climate, speciesOccurrences = 0, discharge = null, iotTemperature = null) {
  const preferences = targetSpecies.preferences;
  const watercourseType = segment.watercourseType || segment.tributaryType || 'rio';
  const m = getHabitatMultipliers(watercourseType);
  
  // Aplicar multiplicadores aos parâmetros do segmento
  const adjustedSegment = {
    ...segment,
    depth: (segment.depth || 0.5) * m.depth,
    flow: (segment.flow || 0.5) * m.flow,
    vegetation: (segment.vegetation || 0.5) * m.vegetation,
    shade: (segment.shade || 0.5) * m.shade,
    turbidity: (segment.turbidity || 0.5) * m.turbidity,
    oxygen: (segment.oxygen || 0.5) * m.oxygen,
    structure: (segment.structure || 0.5) * m.structure
  };
  
  // Habitat base
  const habitat =
    closeness(adjustedSegment.depth, preferences.depth, 4.2) * m.weightDepth +
    closeness(adjustedSegment.flow, preferences.flow, 0.58) * m.weightFlow +
    closeness(adjustedSegment.vegetation, preferences.vegetation, 0.72) * m.weightVegetation +
    closeness(adjustedSegment.shade, preferences.shade, 0.65) * m.weightShade +
    closeness(adjustedSegment.turbidity, preferences.turbidity, 0.70) * m.weightTurbidity +
    closeness(adjustedSegment.oxygen, preferences.oxygen, 0.58) * m.weightOxygen +
    closeness(adjustedSegment.structure, preferences.structure, 0.70) * m.weightStructure;
  
  // Sazonalidade por trecho do rio (baixo vs alto curso)
  const riverZone = classifyRiverZoneByLocation(segment.center);
  const seasonalMultiplier = getSeasonalMultiplier(riverZone);
  
  // Aplicar multiplicador sazonal ao habitat
  const seasonallyAdjustedHabitat = habitat * seasonalMultiplier;

  // Usar temperatura IoT se disponível (mais precisa), senão usar clima
  const effectiveWaterTemp = iotTemperature !== null ? iotTemperature : climate.waterTemperature;
  
  // Bônus por ter sensor IoT próximo (precisão aumenta confiança)
  const iotBonus = iotTemperature !== null ? 5 : 0;

  const weather =
    closeness(effectiveWaterTemp, preferences.temperature, 10) * 10 +
    closeness(climate.solarRadiation, preferences.solar, 82) * 5 +
    activityScore(targetSpecies.activity, climate.hour) * 13 +
    iotBonus;

  const observed = calibrationBonus(speciesOccurrences);

  const flowBonus = discharge ? dischargeModifier(discharge.current, discharge.avg30, preferences.flow) : 0;

  // Bônus/penalidade barométrica — usa sensibilidade específica da espécie (default 0.5)
  const presBonus = pressureBonus(climate, preferences.pressureSensitivity ?? 0.5);

  return Math.round(clamp(seasonallyAdjustedHabitat + weather + observed + flowBonus + presBonus, 4, 100));
}

function probabilityColor(probability) {
  if (probability >= 78) return '#ef4444';
  if (probability >= 62) return '#f97316';
  if (probability >= 46) return '#eab308';
  return '#22c55e';
}

function lerpColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function offsetPolyline(path, offsetMeters) {
  if (path.length < 2 || offsetMeters === 0) return path;

  const result = [];
  const R = 6371000;

  for (let i = 0; i < path.length; i += 1) {
    let dx, dy;

    if (i === 0) {
      dy = path[1][0] - path[0][0];
      dx = path[1][1] - path[0][1];
    } else if (i === path.length - 1) {
      dy = path[i][0] - path[i - 1][0];
      dx = path[i][1] - path[i - 1][1];
    } else {
      dy = path[i + 1][0] - path[i - 1][0];
      dx = path[i + 1][1] - path[i - 1][1];
    }

    const len = Math.sqrt(dx * dx + dy * dy);

    if (len < 1e-12) {
      result.push(path[i]);
      continue;
    }

    const nx = -dy / len;
    const ny = dx / len;
    const latOffset = (offsetMeters / R) * (180 / Math.PI) * nx;
    const lonOffset = (offsetMeters / (R * Math.cos(path[i][0] * Math.PI / 180))) * (180 / Math.PI) * ny;

    result.push([path[i][0] + latOffset, path[i][1] + lonOffset]);
  }

  return result;
}

function lateralProfile(speciesPreferences) {
  const depthPref = speciesPreferences.depth;
  const vegPref = speciesPreferences.vegetation;

  const bankAffinity = clamp((vegPref * 0.6 + (1 - depthPref / 5) * 0.4), 0, 1);
  const centerAffinity = clamp((depthPref / 5 * 0.6 + speciesPreferences.flow * 0.4), 0, 1);

  return {
    bank: 0.15 + bankAffinity * 0.65,
    midBank: 0.25 + (bankAffinity * 0.4 + centerAffinity * 0.3),
    center: 0.20 + centerAffinity * 0.65
  };
}

function hexToHsl(hex) {
  const h6 = parseInt(hex.slice(1), 16);
  let r = ((h6 >> 16) & 0xff) / 255;
  let g = ((h6 >> 8) & 0xff) / 255;
  let b = (h6 & 0xff) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function intensityColor(baseHex, normalizedPct) {
  const { h } = hexToHsl(baseHex);
  const t = clamp(normalizedPct / 100, 0, 1);
  const s = 20 + t * 60;
  const l = 85 - t * 45;
  return hslToHex(h, s, l);
}

function smoothProbabilityColor(probability) {
  return intensityColor('#ef4444', probability);
}

// helper: gera polígono hexagonal aproximado a partir de centro e raio em graus
function approxHexPoly(lat, lon, latR, lonR, n = 8) {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [lat + latR * Math.sin(a), lon + lonR * Math.cos(a)];
  });
}

// Botão flutuante para Iniciar Pescaria (lado esquerdo)
function ModerationModal({ isOpen, onClose, qualityReports, onApprove, onReject, onRefresh }) {
  const [selectedReport, setSelectedReport] = useState(null);
  const [finalScore, setFinalScore] = useState(50);
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleApprove = () => {
    if (!selectedReport) return;
    onApprove(selectedReport.id, finalScore, notes);
    setSelectedReport(null);
    setNotes('');
    setFinalScore(50);
  };

  const handleReject = () => {
    if (!selectedReport) return;
    onReject(selectedReport.id, notes);
    setSelectedReport(null);
    setNotes('');
  };

  return (
    <div className="planner-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="planner-modal" style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="planner-header">
          <h2>🛡️ Moderação de Qualidade da Água</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div style={{ padding: '1rem' }}>
          {/* Lista de reports pendentes */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                Reports Pendentes ({qualityReports.length})
              </h3>
              <button 
                onClick={onRefresh}
                style={{
                  padding: '0.4rem 0.75rem',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                🔄 Atualizar
              </button>
            </div>
            
            {qualityReports.length === 0 ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center', 
                color: '#64748b',
                background: '#0f172a',
                borderRadius: 8 
              }}>
                Nenhum report pendente para moderação.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {qualityReports.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => {
                      setSelectedReport(report);
                      setFinalScore(report.quality_score || 50);
                    }}
                    style={{
                      padding: '0.75rem',
                      background: selectedReport?.id === report.id ? '#1e293b' : '#0f172a',
                      border: selectedReport?.id === report.id ? '2px solid #3b82f6' : '1px solid #334155',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#e5f6ff' }}>
                          {report.watercourse?.name || 'Curso desconhecido'}
                        </strong>
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          padding: '2px 6px',
                          background: report.watercourse?.type === 'rio' ? '#3b82f6' : 
                                     report.watercourse?.type === 'arroio' ? '#22c55e' : '#64748b',
                          color: '#fff',
                          borderRadius: 4,
                          fontSize: '0.7rem'
                        }}>
                          {report.watercourse?.type || 'curso'}
                        </span>
                      </div>
                      <span style={{ 
                        color: report.quality_score >= 70 ? '#22c55e' : 
                               report.quality_score >= 50 ? '#f59e0b' : '#ef4444',
                        fontWeight: 'bold'
                      }}>
                        {report.quality_score}%
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                      Enviado em {new Date(report.created_at).toLocaleString('pt-BR')} • {report.observations || 'Sem observações'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Painel de ação */}
          {selectedReport && (
            <div style={{ 
              padding: '1rem', 
              background: '#1e293b', 
              borderRadius: 8,
              border: '1px solid #334155'
            }}>
              <h4 style={{ margin: '0 0 1rem', color: '#e5f6ff' }}>
                Ação sobre: {selectedReport.watercourse?.name}
              </h4>
              
              {/* Score final */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8' }}>
                  Score Final Ajustado
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={finalScore}
                    onChange={(e) => setFinalScore(parseInt(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ 
                    minWidth: '3rem',
                    padding: '0.25rem 0.5rem',
                    background: finalScore >= 70 ? '#22c55e' : 
                               finalScore >= 50 ? '#f59e0b' : '#ef4444',
                    color: '#fff',
                    borderRadius: 4,
                    fontWeight: 'bold',
                    textAlign: 'center'
                  }}>
                    {finalScore}%
                  </span>
                </div>
              </div>
              
              {/* Notas da moderação */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#94a3b8' }}>
                  Notas da Moderação (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Justificativa da decisão..."
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: '#e5f6ff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              
              {/* Botões de ação */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleApprove}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Aprovar
                </button>
                <button
                  onClick={handleReject}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ❌ Rejeitar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FishingSessionFab({ onClick, hasActiveSession, isMinimized, catchCount }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        background: hasActiveSession
          ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
          : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        color: '#fff',
        border: 'none',
        borderRadius: 50,
        fontWeight: 600,
        fontSize: '0.9rem',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      type="button"
      title={hasActiveSession ? 'Continuar pescaria' : 'Iniciar pescaria'}
    >
      <span style={{ fontSize: '1.2rem' }}>🎣</span>
      {isMinimized && hasActiveSession ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Pescaria ativa
          <span style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: '1px 8px', fontSize: '0.85rem', fontWeight: 700 }}>
            {catchCount} 🐟
          </span>
        </span>
      ) : (
        <span>{hasActiveSession ? 'Continuar pescaria' : 'Iniciar pescaria'}</span>
      )}
    </button>
  );
}

function PlannerFab({ onClick }) {
  const [drops, setDrops] = useState([]);
  const timerRef = useRef(null);

  function spawnDrops() {
    const count = 6;
    const newDrops = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: 30 + Math.random() * 120,
      delay: i * 80,
      size: 5 + Math.random() * 5,
    }));
    setDrops(newDrops);
    setTimeout(() => setDrops([]), 1200);
  }

  useEffect(() => {
    timerRef.current = setInterval(spawnDrops, 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <button
      className="planner-fab"
      onClick={onClick}
      onMouseEnter={spawnDrops}
      type="button"
      title="Planejar pescaria"
    >
      <img src="/logo.png" alt="" className="fab-logo" />
      <span>Planeje sua pescaria!</span>
      {drops.map((d) => (
        <span
          key={d.id}
          className="fab-drop"
          style={{
            left: d.x,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}ms`,
          }}
        />
      ))}
    </button>
  );
}

function EnvImpactReportModal({ watercourse: w, occurrences, dischargeData, iotSensors, onClose }) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('pt-BR');

  // Capturas nesse curso
  const wOccs = occurrences.filter(o => {
    if (w.id === '__santa_lucia__') return !o.tributaryName || o.tributaryName === 'Río Santa Lucía';
    return o.tributaryName === w.name;
  });
  const totalCaptures = wOccs.length;
  const last30 = wOccs.filter(o => {
    const d = new Date(o.timestamp || o.createdAt || 0);
    return (today - d) / 864e5 <= 30;
  }).length;

  // Espécies capturadas
  const spCounts = {};
  for (const o of wOccs) { spCounts[o.species] = (spCounts[o.species] || 0) + 1; }
  const topSpecies = Object.entries(spCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Vedas ativas neste curso
  const vedas = getVedasAtivas(today);

  // Estoque DINARA — espécies relevantes encontradas neste curso
  const stockEntries = topSpecies
    .map(([id]) => ({ id, stock: DINARA_STOCK[id] }))
    .filter(x => x.stock);

  // Score de qualidade
  const qScore = w.waterQuality;
  const qColor = qScore >= 75 ? '#15803d' : qScore >= 50 ? '#b45309' : '#b91c1c';
  const qLabel = qScore >= 75 ? 'Boa' : qScore >= 50 ? 'Moderada' : 'Crítica';

  // Vazão
  const discharge = dischargeData?.current ?? null;

  // Sensores IoT próximos (associados ao curso)
  const nearSensors = (iotSensors || []).filter(s => s.river_name === w.name || (w.id === '__santa_lucia__' && s.river_name === 'Río Santa Lucía'));

  function handlePrint() {
    window.print();
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={onClose}>
      <div className="env-report-modal" onClick={e => e.stopPropagation()} style={{background:'#1e293b',borderRadius:12,padding:'24px',maxWidth:560,width:'100%',maxHeight:'85vh',overflowY:'auto',color:'#f1f5f9',boxShadow:'0 8px 40px rgba(0,0,0,0.5)'}}>
        {/* Cabeçalho */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontSize:'0.7rem',color:'#64748b',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Relatório de Impacto Ambiental · DINARA/MGAP</div>
            <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:700}}>{w.name}</h2>
            <div style={{fontSize:'0.75rem',color:'#94a3b8',marginTop:2}}>{w.type === 'rio' ? 'Rio' : w.type === 'canada' ? 'Cañada' : w.type === 'canal' ? 'Canal' : 'Arroio'} · Gerado em {dateStr}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={handlePrint} title="Exportar PDF" style={{padding:'6px 12px',background:'#0f172a',border:'1px solid #334155',borderRadius:6,color:'#94a3b8',cursor:'pointer',fontSize:'0.75rem'}}>⬇ PDF</button>
            <button onClick={onClose} style={{padding:'4px 8px',background:'transparent',border:'none',color:'#64748b',cursor:'pointer',fontSize:'1.2rem',lineHeight:1}}>✕</button>
          </div>
        </div>

        {/* Qualidade da água */}
        <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8,border:`1px solid ${qColor}44`}}>
          <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>💧 Qualidade da Água</div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{fontSize:'1.8rem',fontWeight:800,color:qColor}}>{qScore}%</div>
            <div>
              <div style={{fontWeight:600,color:qColor}}>{qLabel}</div>
              <div style={{fontSize:'0.72rem',color:'#94a3b8'}}>{w.waterQualityIsReal ? `Dado real — ${w.waterQualitySourceName || 'Supabase'}` : 'Estimativa heurística automática'}</div>
              {w.waterQualityDesc && <div style={{fontSize:'0.72rem',color:'#64748b',marginTop:2}}>{w.waterQualityDesc}</div>}
            </div>
          </div>
        </section>

        {/* Vazão GloFAS */}
        {discharge !== null && w.id === '__santa_lucia__' && (
          <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8}}>
            <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>🌊 Vazão Atual (GloFAS)</div>
            <div style={{fontWeight:700,fontSize:'1.1rem'}}>{Math.round(discharge)} m³/s</div>
            <div style={{fontSize:'0.72rem',color:'#94a3b8'}}>Tendência: {dischargeData?.trend === 'rising' ? '↑ Subindo' : dischargeData?.trend === 'falling' ? '↓ Descendo' : '→ Estável'}</div>
          </section>
        )}

        {/* Sensores IoT */}
        {nearSensors.length > 0 && (
          <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8}}>
            <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>📡 Sensores IoT ({nearSensors.length})</div>
            {nearSensors.map(s => (
              <div key={s.id} style={{fontSize:'0.75rem',display:'flex',gap:12,flexWrap:'wrap',color:'#cbd5e1',marginBottom:4}}>
                <span style={{fontWeight:600}}>{s.name || s.id}</span>
                {s.temperature != null && <span>🌡 {s.temperature.toFixed(1)}°C</span>}
                {s.ph != null && <span>🧪 pH {s.ph.toFixed(1)}</span>}
                {s.turbidity != null && <span>🌫 Turb. {s.turbidity.toFixed(0)} NTU</span>}
                {s.battery != null && <span>🔋 {s.battery}%</span>}
              </div>
            ))}
          </section>
        )}

        {/* Pressão de pesca */}
        <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8}}>
          <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>🎣 Pressão de Pesca (Comunidade)</div>
          <div style={{display:'flex',gap:24}}>
            <div><div style={{fontWeight:700,fontSize:'1.1rem'}}>{totalCaptures}</div><div style={{fontSize:'0.72rem',color:'#94a3b8'}}>capturas totais</div></div>
            <div><div style={{fontWeight:700,fontSize:'1.1rem'}}>{last30}</div><div style={{fontSize:'0.72rem',color:'#94a3b8'}}>últimos 30 dias</div></div>
          </div>
          {topSpecies.length > 0 && (
            <div style={{marginTop:8,fontSize:'0.75rem',color:'#94a3b8'}}>
              Top espécies: {topSpecies.map(([id, n]) => `${id} (${n})`).join(', ')}
            </div>
          )}
        </section>

        {/* Estoque DINARA das espécies capturadas */}
        {stockEntries.length > 0 && (
          <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8}}>
            <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>📊 Estoque DINARA — Espécies Registradas</div>
            {stockEntries.map(({ id, stock }) => {
              const scfg = {
                abundant: { color: '#15803d', label: 'Abundante', icon: '📈' },
                stable:   { color: '#1d4ed8', label: 'Estável',   icon: '📊' },
                reduced:  { color: '#b45309', label: 'Reduzido',  icon: '📉' },
                critical: { color: '#b91c1c', label: 'Crítico',   icon: '🔴' },
              }[stock.status] || { color: '#475569', label: '—', icon: '❓' };
              return (
                <div key={id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,fontSize:'0.75rem'}}>
                  <span style={{fontWeight:600,textTransform:'capitalize',minWidth:100}}>{id}</span>
                  <span style={{color:scfg.color,fontWeight:600}}>{scfg.icon} {scfg.label}</span>
                  <span style={{color:'#64748b',fontSize:'0.68rem'}}>(ref. {stock.year})</span>
                </div>
              );
            })}
          </section>
        )}

        {/* Vedas ativas */}
        {vedas.length > 0 && (
          <section style={{marginBottom:14,padding:'12px',background:'#0f172a',borderRadius:8}}>
            <div style={{fontSize:'0.7rem',color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>🚫 Vedas Ativas Hoje</div>
            {vedas.map(({ veda, sp, status }) => (
              <div key={veda.speciesId} style={{marginBottom:4,fontSize:'0.75rem'}}>
                <span style={{fontWeight:600}}>{sp ? spName(sp, lang) : veda.speciesId}</span>
                <span style={{color: veda.type === 'absoluta' ? '#ef4444' : '#f59e0b', marginLeft:6}}>
                  {veda.type === 'absoluta' ? '🚫 Veda absoluta' : `⏸ ${status === 'active' ? 'Veda ativa' : 'Próxima veda'}`}
                </span>
                <span style={{color:'#64748b',marginLeft:6,fontSize:'0.68rem'}}>{veda.authority}</span>
              </div>
            ))}
          </section>
        )}

        {/* Rodapé */}
        <div style={{fontSize:'0.65rem',color:'#475569',borderTop:'1px solid #1e293b',paddingTop:10,lineHeight:1.6}}>
          Fontes: DINARA · MGAP · CARU · GloFAS/Open-Meteo · Comunidade Pescamon. Dados comunitários podem não refletir a situação real. Verifique sempre a legislação vigente antes de pescar.
        </div>
      </div>
    </div>
  );
}

function WatercourseItem({ w, isSelected, wcLabel, wcIcon, watercourseList, onToggle, onReport, onEnvReport }) {
  const icon = wcIcon(w.type);
  const label = wcLabel(w.type);
  const badges = [];
  if (w.waterQuality < 50) badges.push({ label: '⚠️ Poluído', color: '#ef4444' });
  else if (w.waterQuality < 65) badges.push({ label: '⚡ Qualidade duvidosa', color: '#f97316' });
  const mostPopular = [...watercourseList].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
  if (w.id === mostPopular?.id && w.occurrenceCount > 0) badges.push({ label: '⭐ Favorito', color: '#a78bfa' });
  if (w.hasBigFish) badges.push({ label: '🐟 Peixe grande', color: '#f59e0b' });
  const distStr = w.distKm >= 9999 ? '' : w.distKm < 1 ? `${Math.round(w.distKm*1000)}m` : `${w.distKm.toFixed(1)}km`;
  return (
    <div className={`species-dropdown-item${isSelected ? ' selected' : ''}`} style={{display:'flex',alignItems:'center',paddingRight:6,gap:2}}>
      <button style={{flex:1,display:'flex',alignItems:'center',gap:6,background:'transparent',border:'none',color:'inherit',textAlign:'left',padding:'5px 4px',cursor:'pointer'}} onClick={onToggle} type="button">
        <span className="dd-check" style={{flexShrink:0}}>{isSelected && <Check size={10} />}</span>
        <span style={{fontSize:'0.9rem',flexShrink:0}}>{icon}</span>
        <span className="dd-item-info" style={{flex:1,minWidth:0}}>
          {badges.length > 0 && (
            <span className="wc-badges">
              {badges.map(b => <span key={b.label} className="wc-badge" style={{background:b.color+'22',color:b.color,borderColor:b.color+'55'}}>{b.label}</span>)}
            </span>
          )}
          <strong style={{fontSize:'0.8rem',display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{w.name}</strong>
          <small style={{color:'#64748b'}}>{label}{distStr ? ` · ${distStr}` : ''}{w.occurrenceCount > 0 ? ` · ${w.occurrenceCount} capturas` : ''}{w.waterQuality ? ` · 💧${w.waterQuality}%` : ''}</small>
        </span>
      </button>
      <button type="button" onClick={e=>{e.stopPropagation();onReport();}} title="Reportar qualidade" style={{padding:'3px 5px',background:'rgba(255,255,255,0.06)',border:'none',borderRadius:4,cursor:'pointer',flexShrink:0}}>
        <Flag size={11} color="#64748b" />
      </button>
      <button type="button" onClick={e=>{e.stopPropagation();onEnvReport();}} title="Relatório ambiental" style={{padding:'3px 5px',background:'rgba(255,255,255,0.06)',border:'none',borderRadius:4,cursor:'pointer',fontSize:'0.68rem',lineHeight:1,flexShrink:0}}>📋</button>
    </div>
  );
}

function LangDropdown() {
  const { lang, changeLang } = useLang();
  const [open, setOpen] = React.useState(false);
  const activeLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  return (
    <div style={{ position: 'relative', marginRight: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.15)',
          background: open ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
          color: '#e2e8f0', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1,
        }}
      >
        <img src={activeLang.flag} alt={activeLang.label} style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
        <span style={{ fontWeight: 600 }}>{activeLang.label}</span>
        <ChevronDown size={11} style={{ color: '#64748b', transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            background: '#0d2137', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 140, zIndex: 9999, overflow: 'hidden',
          }}
        >
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => { changeLang(l.code); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: lang === l.code ? 'rgba(34,211,238,0.12)' : 'transparent',
                border: 'none', color: lang === l.code ? '#22d3ee' : '#cbd5e1',
                fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <img src={l.flag} alt={l.label} style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{l.name}</span>
              {lang === l.code && <span style={{ fontSize: '0.65rem', color: '#22d3ee' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const t = useT();
  const { lang, changeLang } = useLang();
  const toast = useToast();

  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState([]);
  const [speciesDropdownOpen, setSpeciesDropdownOpen] = useState(false);
  const [climateScenarios, setClimateScenarios] = useState(fallbackScenarios);
  const [selectedClimateId, setSelectedClimateId] = useState(fallbackScenarios[0].id);
  const [santaLuciaGeometry, setSantaLuciaGeometry] = useState([]);
  const tributaryLines = useTributaryLines();
  const [geojsonStatus, setGeojsonStatus] = useState('loading');
  const [weatherStatus, setWeatherStatus] = useState('loading');
  const [occurrences, setOccurrences] = useState(loadOccurrencesSync);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [registering, setRegistering] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [occurrenceNotes, setOccurrenceNotes] = useState('');
  const [occurrenceWeight, setOccurrenceWeight] = useState('');
  const [occurrenceBait, setOccurrenceBait] = useState('');
  const [authSession, setAuthSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authStatus, setAuthStatus] = useState('idle');
  const [dischargeData, setDischargeData] = useState(null);
  const [temporalFilter, setTemporalFilter] = useState({ type: 'all' });
  const [iotSensorData, setIotSensorData] = useState(null);
  const [speciesColors, setSpeciesColors] = useState(() => {
    try {
      const saved = localStorage.getItem('pescamon-species-colors');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [collapsedCards, setCollapsedCards] = useState(() => {
    try {
      const saved = localStorage.getItem('pescamon-collapsed-cards');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [mapSize, setMapSize] = useState({ width: '100%', height: 700 });
  const [focusedCell, setFocusedCell] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [reportSpots, setReportSpots] = useState(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('heatmap');
  
  const showPaywall = useCallback((feature = 'default') => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
  }, []);
  const [favoriteCells, setFavoriteCells] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pescamon-fav-cells') || '{}'); }
    catch { return {}; }
  });
  const [nominatimNames, setNominatimNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pescamon-nominatim') || '{}'); }
    catch { return {}; }
  });
  const [showSnapAreas, setShowSnapAreas] = useState(true);
  const [protectedAreas, setProtectedAreas] = useState([]); // áreas carregadas por país (RS=UCs ICMBio)
  const [showWatercourses, setShowWatercourses] = useState(true);
  const [activeBasins, setActiveBasins] = useState(new Set()); // bacias visíveis no mapa
  
    const [basinDropdownOpen, setBasinDropdownOpen] = useState(false);
  const [showFishingSpots, setShowFishingSpots] = useState(true);
  const [fishingSpots, setFishingSpots] = useState([]);
  const [spotModal, setSpotModal] = useState(null); // null | { lat, lng } | { spot } (view mode)
  const [spotForm, setSpotForm] = useState({ name: '', description: '', access_type: 'bank', species_ids: [], species_names: [] });
  const [spotSaving, setSpotSaving] = useState(false);
  const [favEditId, setFavEditId] = useState(null);
  const [favEditName, setFavEditName] = useState('');
  const [selectedWatercourseIds, setSelectedWatercourseIds] = useState([]); // [] = nenhum selecionado (sem heatmap)
  
    const [watercourseDropdownOpen, setWatercourseDropdownOpen] = useState(false);
  const [watercourseSearch, setWatercourseSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(() => loadSavedCountry() || 'UY');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState([-34.735, -56.275]);
  const [mapZoom] = useState(8);

  // Solicita localização do usuário ao montar
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setMapCenter(loc);
      },
      () => {} // silencioso se negado
    );
  }, []);

  // Atualizar centro do mapa quando o país mudar
  useEffect(() => {
    console.log('[DEBUG] useEffect centro do mapa executado para', selectedCountry);
    const country = COUNTRIES.find(c => c.id === selectedCountry);
    console.log('[DEBUG] País encontrado:', country);
    if (country?.center) {
      const newCenter = [country.center.latitude, country.center.longitude];
      console.log('[DEBUG] Novo centro do mapa:', newCenter);
      setMapCenter(newCenter);
    }
  }, [selectedCountry]);

  // Recarrega tributários ao trocar país (não na montagem inicial — singleton cuida disso)
  const prevCountryRef = React.useRef(null);
  useEffect(() => {
    if (prevCountryRef.current === null) { prevCountryRef.current = selectedCountry; return; }
    if (prevCountryRef.current === selectedCountry) return;
    prevCountryRef.current = selectedCountry;
    loadTribsForCountry(selectedCountry);
  }, [selectedCountry]);
  
  // Qualidade da água - dados reais do Supabase
  const [waterQualityData, setWaterQualityData] = useState({});

  // Carrega postos de pesca da comunidade
  useEffect(() => {
    getFishingSpots().then(setFishingSpots).catch(() => {});
  }, []);

  const [waterQualityLoading, setWaterQualityLoading] = useState(false);
  
  // Modal de reporte de qualidade
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { id, name, type, currentQuality }

  // Modal de relatório de impacto ambiental
  const [envReportTarget, setEnvReportTarget] = useState(null); // watercourse object

  // Dashboard de lojista
  const [storeAdminOpen, setStoreAdminOpen] = useState(false);
  
  // Pescaria ativa
  const [activeSession, setActiveSession] = useState(null);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionMinimized, setSessionMinimized] = useState(false);
  const [sessionStep, setSessionStep] = useState('select-location'); // 'select-location', 'active', 'add-catch'
  const [selectedSessionLocation, setSelectedSessionLocation] = useState(null);
  const [sessionCatches, setSessionCatches] = useState([]);
  const [catchModalOpen, setCatchModalOpen] = useState(false);
  
  // Modal de identificação por foto (FishID)
  const [fishIdOpen, setFishIdOpen] = useState(false);
  const [fishIdPendingSpecies, setFishIdPendingSpecies] = useState(null); // preencherá espécie ao confirmar

  // Estados para moderação de qualidade da água
  const [qualityReports, setQualityReports] = useState([]);
  const [moderationModalOpen, setModerationModalOpen] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  
  // Estados para sensores IoT
  const [iotSensors, setIotSensors] = useState([]);
  
  const [envDashboardOpen, setEnvDashboardOpen] = useState(false);

  // Hook usePremium para guards
  const { isPremium, canAccessHistoricalHeatmap } = usePremium(authSession?.user?.id);

  // Wrapper para setTemporalFilter com guard premium
  const handleTemporalFilterChange = useCallback((newFilter) => {
    // Filtros avançados (month, season) requerem Premium
    if (newFilter.type !== 'all' && !isPremium) {
      showPaywall('heatmap');
      return;
    }
    setTemporalFilter(newFilter);
  }, [isPremium, showPaywall]);

  // Estado mobile sidebar e tab ativa
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState('map');
  const [activePage, setActivePage] = useState('app'); // 'app' | 'social'

  const { theme, toggleTheme } = useTheme();

  // Bloquear scroll do body quando drawer está aberto
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => document.body.classList.remove('drawer-open');
  }, [sidebarOpen]);

  // Bloquear scroll do body nas páginas social e pescademia (têm scroll próprio)
  useEffect(() => {
    if (activePage === 'social' || activePage === 'pescademia') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [activePage]);

  // Onboarding tutorial
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('pescamon-onboarding-done')
  );

  // Previsão de 7 dias
  const [weekForecast, setWeekForecast] = useState([]);
  const [weekForecastLoading, setWeekForecastLoading] = useState(true);

  // Geometrias dos rios extras (carregadas sob demanda)
  const [extraRiverGeometries, setExtraRiverGeometries] = useState({});

  useEffect(() => {
    const extraIds = selectedWatercourseIds.filter(id => EXTRA_RIVERS.some(r => r.id === id));
    for (const id of extraIds) {
      if (extraRiverGeometries[id]) continue;
      const river = EXTRA_RIVERS.find(r => r.id === id);
      if (!river) continue;
      fetchRiverGeometry(river).then(paths => {
        if (paths) setExtraRiverGeometries(prev => ({ ...prev, [id]: paths }));
      });
    }
  }, [selectedWatercourseIds]);

  // Áreas de preservação carregadas por país (RS = UCs oficiais ICMBio; UY usa SNAP_AREAS
  // inline). Para uma região nova, basta gerar public/protected_areas_<uf>.json + a entrada aqui.
  useEffect(() => {
    const files = { 'BR-RS': 'protected_areas_rs.json' };
    const file = files[selectedCountry];
    if (!file) { setProtectedAreas([]); return; }
    let cancelled = false;
    fetch('/' + file).then(r => (r.ok ? r.json() : [])).catch(() => [])
      .then(data => { if (!cancelled) setProtectedAreas(Array.isArray(data) ? data : []); });
    return () => { cancelled = true; };
  }, [selectedCountry]);

  // Limpa geometrias ao trocar país e pré-carrega EXTRA_RIVERS do novo país
  useEffect(() => {
    // Limpar geometrias do país anterior
    setExtraRiverGeometries({});
    const countryRivers = EXTRA_RIVERS.filter(r => (r.country || 'UY') === selectedCountry);
    console.log('[DEBUG] EXTRA_RIVERS for', selectedCountry, ':', countryRivers.map(r => r.name));
    let cancelled = false;
    const loadNext = async (idx) => {
      if (cancelled || idx >= countryRivers.length) return;
      const river = countryRivers[idx];
      if (!extraRiversCache[river.id]) {
        const paths = await fetchRiverGeometry(river);
        if (!cancelled && paths) setExtraRiverGeometries(prev => ({ ...prev, [river.id]: paths }));
      } else {
        if (!cancelled) setExtraRiverGeometries(prev => ({ ...prev, [river.id]: extraRiversCache[river.id] }));
      }
      setTimeout(() => loadNext(idx + 1), 120);
    };
    loadNext(0);
    return () => { cancelled = true; };
  }, [selectedCountry]);  // eslint-disable-line

  // Estados de relatórios de qualidade
  
  // Carrega sessões ativas e sensores IoT ao iniciar
  useEffect(() => {
    async function loadActiveSession() {
      try {
        const session = await getActiveFishingSession();
        if (session) {
          setActiveSession(session);
          const catches = await getCatchesBySession(session.id);
          setSessionCatches(catches);
        }
      } catch (err) {
        console.error('Failed to load active session:', err);
      }
    }
    loadActiveSession();
  }, []);

  // Carrega sensores IoT e previsão semanal
  useEffect(() => {
    async function loadIoTSensors() {
      try {
        const sensors = await getIoTSensors();
        setIotSensors(sensors || []);
      } catch (err) {
        console.error('Failed to load IoT sensors:', err);
      }
    }
    loadIoTSensors();
    const interval = setInterval(loadIoTSensors, 300000);

    async function loadWeekForecast() {
      try {
        const data = await fetchWeekForecast();
        setWeekForecast(data);
      } catch (err) {
        console.error('Failed to load week forecast:', err);
      } finally {
        setWeekForecastLoading(false);
      }
    }
    loadWeekForecast();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setUserLocation({ lat, lon });
        // Auto-detecta país apenas se não houver preferência salva
        if (!loadSavedCountry()) {
          const detected = detectCountryFromCoords(lat, lon);
          setSelectedCountry(detected);
          saveCountry(detected);
        }
      },
      () => {/* sem permissão, usa fallback UY */}
    );
  }, []);

  function toggleFavorite(cell) {
    setFavoriteCells((prev) => {
      const next = { ...prev };
      if (next[cell.id]) {
        delete next[cell.id];
      } else {
        next[cell.id] = { label: cell.name };
      }
      localStorage.setItem('pescamon-fav-cells', JSON.stringify(next));
      return next;
    });
  }

  function saveFavLabel(cellId) {
    setFavoriteCells((prev) => {
      const next = { ...prev, [cellId]: { ...prev[cellId], label: favEditName || prev[cellId]?.label } };
      localStorage.setItem('pescamon-fav-cells', JSON.stringify(next));
      return next;
    });
    setFavEditId(null);
    setFavEditName('');
  }

  function navigateToCell(cell) {
    setFocusedCell({ ...cell, _ts: Date.now() });
    document.querySelector('.map-resizable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleCardCollapse(cardId) {
    setCollapsedCards((prev) => {
      const next = { ...prev, [cardId]: !prev[cardId] };
      localStorage.setItem('pescamon-collapsed-cards', JSON.stringify(next));
      return next;
    });
  }

  function handleMapResize(event, { size }) {
    setMapSize({ width: '100%', height: size.height });
  }

  function getSpeciesColor(sp) {
    return speciesColors[sp.id] || sp.color;
  }

  function updateSpeciesColor(id, color) {
    setSpeciesColors((prev) => {
      const next = { ...prev, [id]: color };
      localStorage.setItem('pescamon-species-colors', JSON.stringify(next));
      return next;
    });
  }

  const selectedSpeciesId = selectedSpeciesIds[0];
  const selectedSpecies = species.find((item) => item.id === selectedSpeciesId) || species[0];
  const selectedSpeciesList = selectedSpeciesIds.map((id) => species.find((s) => s.id === id)).filter(Boolean);
  const selectedClimate = climateScenarios.find((item) => item.id === selectedClimateId) || climateScenarios[0];

  function toggleSpecies(id) {
    setSelectedSpeciesIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  const prevAuthRef = useRef(null);
  useEffect(() => {
    getSession().then((session) => {
      setAuthSession(session);
      prevAuthRef.current = session;
    });
    const subscription = onAuthChange((session) => {
      const wasLoggedOut = !prevAuthRef.current;
      const isLoggingIn = !!session;
      setAuthSession(session);
      prevAuthRef.current = session;
      if (wasLoggedOut && isLoggingIn) {
        migrateAnonymousOccurrences().catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToOccurrences(
      (newOccurrence) => {
        setOccurrences((prev) => {
          if (prev.some((o) => String(o.id) === String(newOccurrence.id))) return prev;
          return [...prev, newOccurrence];
        });
        addOccurrence(newOccurrence);
        toast.info(`Nova ocorrência: ${newOccurrence.speciesName}`);
      },
      (deletedId) => {
        setOccurrences((prev) => prev.filter((o) => String(o.id) !== String(deletedId)));
        removeOccurrence(deletedId);
        toast.info('Ocorrência removida por outro dispositivo');
      }
    );

    return unsubscribe;
  }, []);

  async function handleLogin() {
    if (!authEmail.trim()) return;
    setAuthStatus('sending');
    try {
      await signInWithMagicLink(authEmail.trim());
      setAuthStatus('sent');
    } catch {
      setAuthStatus('error');
    }
  }

  async function handleLogout() {
    await signOut();
    setAuthSession(null);
    setAuthStatus('idle');
  }

  useEffect(() => {
    async function loadAndSync() {
      const local = await loadAllOccurrences();
      if (local.length > 0) setOccurrences(local);

      try {
        setSyncStatus('syncing');
        const remote = await fetchRemoteOccurrences();
        const localIds = new Set(local.map((o) => String(o.id)));
        const newFromRemote = remote.filter((o) => !localIds.has(String(o.id)));

        if (newFromRemote.length > 0) {
          const merged = [...local, ...newFromRemote];
          setOccurrences(merged);
          for (const o of newFromRemote) await addOccurrence(o);
        }

        const remoteIds = new Set(remote.map((o) => String(o.id)));
        const localOnly = local.filter((o) => !remoteIds.has(String(o.id)));
        if (localOnly.length > 0) await pushAllOccurrences(localOnly);

        setSyncStatus('synced');
      } catch {
        setSyncStatus('offline');
      }
    }

    loadAndSync();
  }, []);

  async function manualSync() {
    try {
      setSyncStatus('syncing');
      await pushAllOccurrences(occurrences);
      const remote = await fetchRemoteOccurrences();
      const localIds = new Set(occurrences.map((o) => String(o.id)));
      const newFromRemote = remote.filter((o) => !localIds.has(String(o.id)));

      if (newFromRemote.length > 0) {
        const merged = [...occurrences, ...newFromRemote];
        setOccurrences(merged);
        for (const o of newFromRemote) await addOccurrence(o);
      }

      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  const handleMapClick = useCallback((latlng) => {
    setPendingLocation(latlng);
    setOccurrenceNotes('');
  }, []);

  function confirmOccurrence() {
    if (!pendingLocation) return;

    const nearestCell = scoredSegments.find((cell) => {
      const [sw, ne] = cell.bounds;
      return pendingLocation[0] >= sw[0] && pendingLocation[0] <= ne[0] &&
             pendingLocation[1] >= sw[1] && pendingLocation[1] <= ne[1];
    });
    const newOccurrence = {
      id: Date.now(),
      speciesId: selectedSpeciesId,
      speciesName: spName(selectedSpecies, lang),
      location: pendingLocation,
      date: new Date().toISOString(),
      notes: occurrenceNotes.trim(),
      weightKg: occurrenceWeight ? parseFloat(occurrenceWeight) : 0,
      baitUsed: occurrenceBait.trim() || null,
      cellId: nearestCell ? nearestCell.id : null
    };

    const updated = [...occurrences, newOccurrence];
    setOccurrences(updated);
    addOccurrence(newOccurrence);
    pushOccurrence(newOccurrence).catch(() => setSyncStatus('offline'));
    if (occurrenceBait.trim()) {
      recordBaitUse(selectedSpeciesId, occurrenceBait.trim(), nearestCell?.id || null).catch(() => {});
    }
    setPendingLocation(null);
    setOccurrenceNotes('');
    setOccurrenceWeight('');
    setOccurrenceBait('');
    setRegistering(false);
  }

  function deleteOccurrence(id) {
    const updated = occurrences.filter((o) => o.id !== id);
    setOccurrences(updated);
    removeOccurrence(id);
    deleteRemoteOccurrence(id).catch(() => setSyncStatus('offline'));
  }

  function cancelOccurrence() {
    setPendingLocation(null);
    setOccurrenceNotes('');
    setOccurrenceWeight('');
    setOccurrenceBait('');
    setRegistering(false);
  }

  const fileInputRef = useRef(null);

  async function handleImport(event) {
    const file = event.target.files[0];

    if (!file) return;

    try {
      const imported = await importOccurrencesJSON(file);
      const merged = [...occurrences, ...imported.filter((o) => !occurrences.some((e) => e.id === o.id))];
      setOccurrences(merged);
      pushAllOccurrences(imported).catch(() => setSyncStatus('offline'));
    } catch {
      // silent
    }

    event.target.value = '';
  }

  function countOccurrencesInCell(cell, speciesFilter) {
    return occurrences.filter((o) => {
      if (speciesFilter && o.speciesId !== speciesFilter) return false;
      const [sw, ne] = cell.bounds;
      return o.location[0] >= sw[0] && o.location[0] <= ne[0] && o.location[1] >= sw[1] && o.location[1] <= ne[1];
    }).length;
  }

  useEffect(() => {
    async function loadSantaLuciaGeometry() {
      try {
        const response = await fetch('/export.geojson');

        if (!response.ok) {
          throw new Error(`Falha ao carregar GeoJSON: ${response.status}`);
        }

        const geojson = await response.json();
        const geometry = extractSantaLuciaGeometry(geojson);
        setSantaLuciaGeometry(geometry);
        setGeojsonStatus('ready');
      } catch (error) {
        setGeojsonStatus('error');
      }
    }

    if (!globalThis.__pescamon_geojson_loaded__) {
      globalThis.__pescamon_geojson_loaded__ = true;
      loadSantaLuciaGeometry();
    }

  }, []);

  useEffect(() => {
    async function loadWeather() {
      try {
        const liveClimate = await fetchCurrentWeather();
        setClimateScenarios([liveClimate, ...fallbackScenarios]);
        setSelectedClimateId('clima-atual');
        setWeatherStatus('ready');
      } catch (error) {
        setWeatherStatus('fallback');
      }
    }

    async function loadDischarge() {
      try {
        const data = await fetchRiverDischarge();
        setDischargeData(data);

        if (data.alerts && data.alerts.length > 0 && 'Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            const shown = sessionStorage.getItem('pescamon-alert-shown');
            if (!shown) {
              const first = data.alerts[0];
              new Notification('Pescamon — Alerta hidrológico', {
                body: `${first.label} prevista em ${first.day.slice(5)}: ${Math.round(first.value)} m³/s (${Math.round(first.ratio * 100)}% da média)`,
                icon: '🌊',
                tag: 'discharge-alert'
              });
              sessionStorage.setItem('pescamon-alert-shown', '1');
            }
          }
        }
      } catch {
        // silent — discharge is optional
      }
    }

    loadWeather();
    loadDischarge();
  }, []);

  const riverSegments = useMemo(
    () => santaLuciaGeometry.length > 0
      ? buildMorphologicalSegments(santaLuciaGeometry, 'rio', 'santa-lucia', 'Río Santa Lucía')
      : [],
    [santaLuciaGeometry]
  );

  const tributarySegments = useMemo(() => {
    if (tributaryLines.length === 0) return [];
    return tributaryLines.flatMap((t) => {
      if (t.paths.length === 0) return [];
      const wcType = classifyWatercourse(t.name || '');
      const safeId = (t.id || t.name || 'trib').replace(/[^a-z0-9]/gi, '-').slice(0, 20);
      const segs = buildMorphologicalSegments(t.paths, wcType, safeId, t.name || '');
      return segs.map((seg, i) => ({ ...seg, tributaryName: t.name || '', watercourseType: wcType, id: `trib-${safeId}-${i}` }));
    });
  }, [tributaryLines]);

  const ensembleModels = useMemo(
    () => {
      if (riverSegments.length === 0) return {};
      const models = {};
      for (const spId of selectedSpeciesIds) {
        models[spId] = trainEnsembleModel(riverSegments, occurrences, spId);
      }
      return models;
    },
    [riverSegments, occurrences, selectedSpeciesIds]
  );

  const ensembleModel = ensembleModels[selectedSpeciesId] || null;

  // Treinar ensemble para afluentes quando há capturas suficientes
  const tributaryEnsembleModels = useMemo(() => {
    if (tributarySegments.length === 0) return {};
    
    // Contar ocorrências por segmento de afluente
    const segmentOccurrences = {};
    for (const occ of occurrences) {
      if (occ.segmentId && occ.segmentId.startsWith('trib_')) {
        if (!segmentOccurrences[occ.segmentId]) {
          segmentOccurrences[occ.segmentId] = [];
        }
        segmentOccurrences[occ.segmentId].push(occ);
      }
    }
    
    // Treinar modelo apenas para espécies com dados suficientes em afluentes
    const models = {};
    const MIN_OCCURRENCES = 3; // Mínimo de ocorrências para treinar
    
    for (const spId of selectedSpeciesIds) {
      const speciesOccs = occurrences.filter(o => o.speciesId === spId);
      const tributaryOccs = speciesOccs.filter(o => o.segmentId?.startsWith('trib_'));
      
      if (tributaryOccs.length >= MIN_OCCURRENCES) {
        // Criar segmentos sintéticos para treinamento baseados nas capturas
        const trainingSegments = tributaryOccs.map((occ, idx) => ({
          id: occ.segmentId || `trib_train_${idx}`,
          tributaryName: occ.tributaryName || 'Afluente',
          center: [occ.lat, occ.lon],
          occurrences: 1,
          speciesId: spId
        }));
        
        if (trainingSegments.length >= MIN_OCCURRENCES) {
          models[spId] = trainEnsembleModel(trainingSegments, occurrences, spId);
        }
      }
    }
    
    return models;
  }, [tributarySegments, occurrences, selectedSpeciesIds]);

  const tributaryEnsembleModel = tributaryEnsembleModels[selectedSpeciesId] || null;

  const activeModelInfo = useMemo(
    () => modelSummary(ensembleModel),
    [ensembleModel]
  );

  const heatmapActive = selectedSpeciesIds.length > 0;
  const selectedWatercourseIdsSet = new Set(selectedWatercourseIds);

  const scoredTributarySegments = useMemo(() => {
    if (!heatmapActive || tributarySegments.length === 0) return [];
    if (selectedWatercourseIds.length === 0) return [];
    const activeIds = selectedSpeciesIds;
    const selectedTribNames = new Set(
      tributaryLines.filter((t) => selectedWatercourseIdsSet.has(t.id)).map((t) => t.name)
    );
    return tributarySegments
      .filter((segment) => selectedTribNames.has(segment.tributaryName))
      .map((segment) => {
        let totalProb = 0;
        for (const spId of activeIds) {
          const sp = species.find((s) => s.id === spId);
          const speciesOccurrences = countOccurrencesInCell(segment, spId);
          const bonus = calibrationBonus(speciesOccurrences);
          
          // Usar ensemble específico para afluentes se disponível
          const tributaryEnsembleProb = predictEnsemble(tributaryEnsembleModels[spId], segment.center, selectedClimate);
          const mainEnsembleProb = predictEnsemble(ensembleModels[spId], segment.center, selectedClimate);
          const heuristicScore = calculateProbability(segment, sp, selectedClimate, speciesOccurrences, dischargeData);
          
          // Prioridade: ensemble de afluentes > ensemble principal > heurística
          let prob;
          if (tributaryEnsembleProb !== null) {
            prob = tributaryEnsembleProb * 0.8 + heuristicScore * 0.2;
          } else if (mainEnsembleProb !== null) {
            prob = mainEnsembleProb * 0.6 + heuristicScore * 0.4;
          } else {
            prob = heuristicScore;
          }
          
          totalProb += prob + bonus;
        }
        const probability = Math.round(totalProb / activeIds.length);
        return { ...segment, probability: isNaN(probability) ? 0 : probability };
      });
  }, [tributarySegments, selectedSpecies, selectedSpeciesList, selectedClimate, occurrences, selectedSpeciesIds, ensembleModels, tributaryEnsembleModels, dischargeData, selectedWatercourseIds]);

  // Heatmap para EXTRA_RIVERS selecionados (Rio Negro, Uruguay, etc.)
  const scoredExtraRiverSegments = useMemo(() => {
    if (!heatmapActive || selectedSpeciesIds.length === 0) return [];
    const selectedExtras = EXTRA_RIVERS.filter(r => selectedWatercourseIdsSet.has(r.id));
    if (selectedExtras.length === 0) return [];
    const result = [];
    for (const river of selectedExtras) {
      const paths = extraRiverGeometries[river.id];
      if (!paths || paths.length === 0) continue;
      const wcType = river.type || classifyWatercourse(river.name || '');
      const segs = buildMorphologicalSegments(paths, wcType, river.id.replace(/[^a-z0-9]/gi, '-'), river.name || '');
      for (let i = 0; i < segs.length; i++) {
        const segment = { ...segs[i], riverName: river.name, riverId: river.id, riverColor: river.color, id: `extra-${river.id}-${i}` };
        let totalProb = 0;
        for (const spId of selectedSpeciesIds) {
          const sp = species.find(s => s.id === spId);
          const speciesOccurrences = countOccurrencesInCell(segment, spId);
          const bonus = calibrationBonus(speciesOccurrences);
          const ensembleProb = predictEnsemble(ensembleModels[spId], segment.center, selectedClimate);
          const heuristicScore = calculateProbability(segment, sp, selectedClimate, speciesOccurrences, dischargeData);
          const prob = ensembleProb !== null ? ensembleProb * 0.6 + heuristicScore * 0.4 : heuristicScore;
          totalProb += prob + bonus;
        }
        const probability = Math.round(totalProb / selectedSpeciesIds.length);
        result.push({ ...segment, probability: isNaN(probability) ? 0 : probability });
      }
    }
    return result;
  }, [extraRiverGeometries, selectedSpeciesIds, selectedClimate, occurrences, ensembleModels, dischargeData, selectedWatercourseIds]);

  // Busca dados reais de qualidade da água quando tributários são carregados
  useEffect(() => {
    if (!tributaryLines || tributaryLines.length === 0) return;
    
    async function loadWaterQuality() {
      setWaterQualityLoading(true);
      try {
        // Inclui apenas IDs com possíveis dados reais — Overpass ways nunca têm rows em water_quality_data
        const ids = ['__santa_lucia__', ...EXTRA_RIVERS.map(r => r.id)];
        const qualityData = await getBatchWaterQuality(ids);
        setWaterQualityData(qualityData || {});
      } catch (err) {
        console.error('Failed to load water quality:', err);
        setWaterQualityData({}); // Garante objeto vazio em caso de erro
      } finally {
        setWaterQualityLoading(false);
      }
    }
    
    loadWaterQuality();
  }, [tributaryLines]);

  // Retorna qualidade da água, priorizando dados reais sobre heurística
  function getWaterQualityForCourse(id, name, type, centerLat, centerLon) {
    const realData = waterQualityData[id];
    if (realData) {
      return {
        score: realData.quality_score,
        source: realData.source_type, // 'official' | 'crowdsourced'
        sourceName: realData.source_name,
        isRealData: true,
        description: realData.description,
        measuredAt: realData.measured_at
      };
    }
    // Fallback para heurística
    return {
      score: estimateWaterQualityHeuristic(name, type, centerLat, centerLon),
      source: 'heuristic',
      sourceName: 'Estimativa automática',
      isRealData: false,
      description: 'Baseado em localização e características',
      measuredAt: null
    };
  }

  // Lista de cursos d'água ordenada — depende de scoredSegments/scoredTributarySegments, definida aqui
  const watercourseList = useMemo(() => {
    const loc = userLocation || { lat: RIVER_CENTER.latitude, lon: RIVER_CENTER.longitude };
    function haversineDist(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function distToPath(paths) {
      let minD = Infinity;
      for (const path of paths) {
        for (const [lat, lon] of path) {
          const d = haversineDist(loc.lat, loc.lon, lat, lon);
          if (d < minD) minD = d;
        }
      }
      return minD;
    }
    function getCenter(paths) {
      const flat = paths.flat();
      if (!flat.length) return [RIVER_CENTER.latitude, RIVER_CENTER.longitude];
      const lat = flat.reduce((s, p) => s + p[0], 0) / flat.length;
      const lon = flat.reduce((s, p) => s + p[1], 0) / flat.length;
      return [lat, lon];
    }
    // Rio principal com qualidade real ou fallback
    const mainRiverQuality = getWaterQualityForCourse('__santa_lucia__', 'Río Santa Lucía', 'rio', RIVER_CENTER.latitude, RIVER_CENTER.longitude);
    const mainRiver = {
      id: '__santa_lucia__', name: 'Río Santa Lucía', type: 'rio', paths: santaLuciaGeometry,
      center: getCenter(santaLuciaGeometry),
      distKm: distToPath(santaLuciaGeometry), hasBigFish: true,
      bigFishDistKm: distToPath(santaLuciaGeometry),
      occurrenceCount: 0, avgProb: 0,
      waterQuality: mainRiverQuality.score,
      waterQualitySource: mainRiverQuality.source,
      waterQualitySourceName: mainRiverQuality.sourceName,
      waterQualityIsReal: mainRiverQuality.isRealData,
      waterQualityDesc: mainRiverQuality.description,
    };
    
    const tributaries = tributaryLines.map((t) => {
      const wcType = classifyWatercourse(t.name || '');
      const allowedIds = SPECIES_BY_WATERCOURSE[wcType] || [];
      const hasBig = allowedIds.some((id) => BIG_FISH_SPECIES.has(id));
      const distKm = distToPath(t.paths);
      const [cLat, cLon] = getCenter(t.paths);
      const qualityInfo = getWaterQualityForCourse(t.id, t.name, wcType, cLat, cLon);
      const tribSegs = scoredTributarySegments.filter((s) => s.tributaryName === t.name);
      const avgProb = tribSegs.length > 0 ? Math.round(tribSegs.reduce((s, c) => s + c.probability, 0) / tribSegs.length) : 0;
      const occ = occurrences.filter((o) => tribSegs.some((s) => s.id === o.cellId)).length;
      return { 
        id: t.id, name: t.name, type: wcType, paths: t.paths, distKm,
        center: [cLat, cLon],
        regionId: t.regionId,
        hasBigFish: hasBig, bigFishDistKm: hasBig ? distKm : Infinity, 
        occurrenceCount: occ, avgProb, 
        waterQuality: qualityInfo.score,
        waterQualitySource: qualityInfo.source,
        waterQualitySourceName: qualityInfo.sourceName,
        waterQualityIsReal: qualityInfo.isRealData,
        waterQualityDesc: qualityInfo.description,
      };
    });
    // Rios e lagoas extras (Rio Negro, Yi, Uruguay, costa atlântica)
    const extraRivers = EXTRA_RIVERS.map((r) => {
      const paths = extraRiverGeometries[r.id] || [];
      const distKm = paths.length > 0 ? distToPath(paths) : 9999;
      return {
        id: r.id, name: r.name, type: r.type || 'rio', paths,
        center: paths.length > 0 ? getCenter(paths) : [r.bbox ? (r.bbox[0]+r.bbox[2])/2 : RIVER_CENTER.latitude, r.bbox ? (r.bbox[1]+r.bbox[3])/2 : RIVER_CENTER.longitude],
        distKm, hasBigFish: true, bigFishDistKm: distKm,
        occurrenceCount: 0, avgProb: 0,
        waterQuality: 70, waterQualitySource: 'heuristic',
        waterQualitySourceName: 'Estimativa automática',
        waterQualityIsReal: false, waterQualityDesc: null,
        color: r.color, isExtraRiver: true,
        loadingGeometry: paths.length === 0 && selectedWatercourseIds.includes(r.id),
      };
    });

    const seenIds = new Set();
    const allCourses = [mainRiver, ...tributaries, ...extraRivers].filter(w => {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      return true;
    });
    // Filtra por país selecionado — exclui cursos cujo centro está fora do bbox
    const countryFiltered = allCourses.filter(w => {
      if (!w.center) return false; // sem coordenada: exclui
      return coordInCountry(w.center[0], w.center[1], selectedCountry);
    });
    return countryFiltered.sort((a, b) => {
      // Penaliza cursos poluídos (qualidade < 50) — envia para o final
      const aPolluted = a.waterQuality < 50 ? 1 : 0;
      const bPolluted = b.waterQuality < 50 ? 1 : 0;
      if (aPolluted !== bPolluted) return aPolluted - bPolluted;
      // Rios extras ficam ao fim se não selecionados
      if (a.isExtraRiver && !b.isExtraRiver) return 1;
      if (!a.isExtraRiver && b.isExtraRiver) return -1;
      // Ordenação normal
      if (Math.abs(a.distKm - b.distKm) > 0.5) return a.distKm - b.distKm;
      if (Math.abs(a.bigFishDistKm - b.bigFishDistKm) > 0.5) return a.bigFishDistKm - b.bigFishDistKm;
      if (a.occurrenceCount !== b.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
      return b.avgProb - a.avgProb;
    });
  }, [tributaryLines, santaLuciaGeometry, scoredTributarySegments, occurrences, userLocation, extraRiverGeometries, selectedWatercourseIds, selectedCountry]);

  const selectedWatercourses = watercourseList.filter((w) => selectedWatercourseIds.includes(w.id));

  // União dos tipos de curso selecionados para filtrar espécies disponíveis
  const availableSpecies = useMemo(() => {
    if (selectedWatercourses.length === 0) return species;
    const allowed = new Set(selectedWatercourses.flatMap((w) => SPECIES_BY_WATERCOURSE[w.type] || []));
    return species.filter((s) => allowed.has(s.id));
  }, [selectedWatercourses]);

  // Remove espécies selecionadas que não existem em nenhum curso selecionado
  useEffect(() => {
    if (selectedWatercourses.length === 0) return;
    const allowed = new Set(selectedWatercourses.flatMap((w) => SPECIES_BY_WATERCOURSE[w.type] || []));
    setSelectedSpeciesIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [selectedWatercourseIds.join(',')]);

  const scoredSegments = useMemo(
    () => {
      if (!heatmapActive) return [];
      if (selectedWatercourseIds.length === 0) return [];
      if (!selectedWatercourseIdsSet.has('__santa_lucia__')) return [];
      const activeIds = selectedSpeciesIds;
      const primarySpId = activeIds[0];
      return riverSegments
        .map((segment) => {
          let totalProb = 0;
          let primaryResult = {};

          for (const spId of activeIds) {
            const sp = species.find((s) => s.id === spId);
            const em = ensembleModels[spId] || null;
            const speciesOccurrences = countOccurrencesInCell(segment, spId);
            const bonus = calibrationBonus(speciesOccurrences);
            const heuristicScore = calculateProbability(segment, sp, selectedClimate, speciesOccurrences, dischargeData);
            const ensemblePrediction = predictEnsemble(em, segment);

            let finalProbability;
            let modelType;

            const spatialPrior = getSpatialPrior(em, segment.id);
            const bayesPosterior = getBayesianPosterior(em, segment.id);

            if (ensemblePrediction !== null) {
              const ensembleScore = Math.round(clamp(ensemblePrediction * 100, 4, 100));
              finalProbability = Math.round(heuristicScore * 0.55 + ensembleScore * 0.45);
              modelType = bayesPosterior != null ? 'bayesian-ensemble' : 'ensemble';
            } else {
              finalProbability = heuristicScore;
              modelType = 'heuristic';
            }

            totalProb += finalProbability;

            if (spId === primarySpId) {
              primaryResult = {
                speciesOccurrences,
                calibration: Math.round(bonus),
                heuristicScore,
                ensembleScore: ensemblePrediction !== null ? Math.round(ensemblePrediction * 100) : null,
                spatialPrior: spatialPrior != null ? Math.round(spatialPrior * 100) : null,
                bayesPosterior: bayesPosterior != null ? Math.round(bayesPosterior * 100) : null,
                dischargeEffect: dischargeData ? dischargeModifier(dischargeData.current, dischargeData.avg30, sp.preferences.flow) : 0,
                modelType
              };
            }
          }

          const avgProb = Math.round(totalProb / activeIds.length);

          return {
            ...segment,
            ...(primaryResult || {}),
            probability: isNaN(avgProb) ? 0 : avgProb
          };
        })
        .sort((a, b) => b.probability - a.probability);
    },
    [riverSegments, selectedSpecies, selectedSpeciesList, selectedClimate, occurrences, selectedSpeciesIds, ensembleModels, dischargeData, selectedWatercourseIds]
  );

  const probRange = useMemo(() => {
    if (scoredSegments.length === 0) return { min: 0, max: 100, span: 100 };

    const probs = scoredSegments.map((c) => c.probability);
    const min = Math.min(...probs);
    const max = Math.max(...probs);
    const span = max - min || 1;

    return { min, max, span };
  }, [scoredSegments]);

  const { permission: pushPermission, subscribed: pushSubscribed, subscribing: pushSubscribing, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe, notify: pushNotify, requestPermission: pushRequestPermission } = usePushNotifications(authSession?.user?.id || null);
  const lastAlertedCell = useRef(null);
  useEffect(() => {
    if (scoredSegments.length === 0) return;
    const top = scoredSegments[0];
    if (top.probability < 75) return;
    const key = `${top.id}-${selectedClimateId}-${Math.round(top.probability)}`;
    if (lastAlertedCell.current === key) return;
    lastAlertedCell.current = key;
    pushNotify({
      title: `🎯 Condição ideal detectada!`,
      body: `${spName(top, lang)} — ${top.probability}% para ${selectedSpeciesList.map((s) => spName(s, lang)).join(', ')}`,

      tag: 'ideal-condition',
    });
  }, [scoredSegments, selectedClimateId]);

  // Nominatim reverse geocoding — enriquece nomes das células em background
  useEffect(() => {
    if (riverSegments.length === 0) return;
    let cancelled = false;
    const missing = riverSegments.filter((s) => !nominatimNames[s.id]);
    if (missing.length === 0) return;

    async function enrichBatch(batch) {
      for (const seg of batch) {
        if (cancelled) return;
        try {
          const [lat, lon] = seg.center;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt`,
            { headers: { 'Accept-Language': 'pt' } }
          );
          const data = await res.json();
          if (!cancelled) {
            const addr = data.address || {};
            // Constrói nome composto: referência local + localidade
            const local =
              addr.road || addr.footway || addr.path ||
              addr.hamlet || addr.suburb || addr.neighbourhood ||
              addr.village || addr.town || addr.city_district || '';
            const locality =
              addr.village || addr.town || addr.municipality ||
              addr.city || addr.county || '';
            // Combina sem duplicar
            const place = local && locality && local !== locality
              ? `${local}, ${locality}`
              : local || locality || '';
            if (place) {
              setNominatimNames((prev) => {
                const next = { ...prev, [seg.id]: place };
                try { localStorage.setItem('pescamon-nominatim', JSON.stringify(next)); } catch { /* quota */ }
                return next;
              });
            }
          }
        } catch { /* ignora falhas individuais */ }
        await new Promise((r) => setTimeout(r, 1100)); // respeita rate limit 1 req/s
      }
    }

    enrichBatch(missing);
    return () => { cancelled = true; };
  }, [riverSegments]);

  const cellDisplayNames = useMemo(() => {
    const names = {};
    const usedNames = {};

    for (const cell of scoredSegments.length > 0 ? scoredSegments : riverSegments) {
      if (favoriteCells[cell.id]?.label && favoriteCells[cell.id].label !== cell.name) {
        names[cell.id] = favoriteCells[cell.id].label;
        continue;
      }
      const nom = nominatimNames[cell.id];
      const base = nom ? `${nom}` : cell.name;
      const key = base.toLowerCase();
      usedNames[key] = (usedNames[key] || 0) + 1;
      names[cell.id] = { base, count: usedNames[key] };
    }

    // Segunda passagem: adicionar sufixo ordinal onde o nome base se repete
    const finalCounts = {};
    for (const cell of scoredSegments.length > 0 ? scoredSegments : riverSegments) {
      if (typeof names[cell.id] === 'string') continue; // favorito já resolvido
      const { base } = names[cell.id];
      const key = base.toLowerCase();
      finalCounts[key] = finalCounts[key] || { total: usedNames[key], seq: 0 };
      finalCounts[key].seq++;
      if (finalCounts[key].total > 1) {
        names[cell.id] = `${base} (${finalCounts[key].seq})`;
      } else {
        names[cell.id] = base;
      }
    }

    return names;
  }, [scoredSegments, riverSegments, nominatimNames, favoriteCells]);

  function getCellDisplayName(cell) {
    return cellDisplayNames[cell.id] || cell.name;
  }

  const filteredOccurrences = useMemo(
    () => filterOccurrences(occurrences, temporalFilter),
    [occurrences, temporalFilter]
  );

  const activeColor = selectedSpeciesList.length === 1
    ? getSpeciesColor(selectedSpeciesList[0])
    : getSpeciesColor(selectedSpecies);

  const riverBands = useMemo(() => {
    if (!heatmapActive || scoredSegments.length === 0) return [];

    const profile = lateralProfile(selectedSpecies.preferences);
    const riverWidthM = 60;

    return scoredSegments.map((cell) => {
      const normalized = ((cell.probability - probRange.min) / probRange.span) * 100;
      const color = intensityColor(activeColor, normalized);
      const baseOpacity = 0.25 + (normalized / 100) * 0.55;

      return {
        id: cell.id,
        bands: [
          { path: offsetPolyline(cell.path, -riverWidthM), weight: 10, opacity: baseOpacity * profile.bank },
          { path: offsetPolyline(cell.path, -riverWidthM * 0.5), weight: 12, opacity: baseOpacity * profile.midBank },
          { path: cell.path, weight: 14, opacity: baseOpacity * profile.center },
          { path: offsetPolyline(cell.path, riverWidthM * 0.5), weight: 12, opacity: baseOpacity * profile.midBank },
          { path: offsetPolyline(cell.path, riverWidthM), weight: 10, opacity: baseOpacity * profile.bank }
        ],
        color
      };
    });
  }, [scoredSegments, selectedSpecies, probRange, activeColor]);

  const tributaryBands = useMemo(() => {
    if (!heatmapActive || scoredTributarySegments.length === 0) return [];
    const profile = lateralProfile(selectedSpecies.preferences);
    const allProbs = scoredTributarySegments.map(s => s.probability);
    const minP = Math.min(...allProbs);
    const spanP = (Math.max(...allProbs) - minP) || 1;
    return scoredTributarySegments.map((seg) => {
      const normalized = (seg.probability - minP) / spanP * 100;
      const color = intensityColor(activeColor, normalized);
      const baseOpacity = 0.25 + (normalized / 100) * 0.55;
      const w = 30; // afluentes são mais estreitos que o rio principal
      return {
        id: seg.id, color,
        popup: { name: seg.tributaryName, probability: seg.probability, seg },
        bands: [
          { path: offsetPolyline(seg.path, -w), weight: 7, opacity: baseOpacity * profile.bank },
          { path: offsetPolyline(seg.path, -w * 0.5), weight: 9, opacity: baseOpacity * profile.midBank },
          { path: seg.path.length >= 2 ? seg.path : [seg.center, seg.center], weight: 10, opacity: baseOpacity * profile.center },
          { path: offsetPolyline(seg.path, w * 0.5), weight: 9, opacity: baseOpacity * profile.midBank },
          { path: offsetPolyline(seg.path, w), weight: 7, opacity: baseOpacity * profile.bank },
        ],
      };
    });
  }, [scoredTributarySegments, selectedSpecies, activeColor, heatmapActive]);

  const extraRiverBands = useMemo(() => {
    if (!heatmapActive || scoredExtraRiverSegments.length === 0) return [];
    const profile = lateralProfile(selectedSpecies.preferences);
    const allProbs = scoredExtraRiverSegments.map(s => s.probability);
    const minP = Math.min(...allProbs);
    const spanP = (Math.max(...allProbs) - minP) || 1;
    return scoredExtraRiverSegments.map((seg) => {
      const normalized = (seg.probability - minP) / spanP * 100;
      const color = intensityColor(activeColor, normalized);
      const baseOpacity = 0.25 + (normalized / 100) * 0.55;
      const w = 50;
      return {
        id: seg.id, color,
        popup: { name: seg.riverName, probability: seg.probability },
        bands: [
          { path: offsetPolyline(seg.path, -w), weight: 9, opacity: baseOpacity * profile.bank },
          { path: offsetPolyline(seg.path, -w * 0.5), weight: 11, opacity: baseOpacity * profile.midBank },
          { path: seg.path.length >= 2 ? seg.path : [seg.center, seg.center], weight: 13, opacity: baseOpacity * profile.center },
          { path: offsetPolyline(seg.path, w * 0.5), weight: 11, opacity: baseOpacity * profile.midBank },
          { path: offsetPolyline(seg.path, w), weight: 9, opacity: baseOpacity * profile.bank },
        ],
      };
    });
  }, [scoredExtraRiverSegments, selectedSpecies, activeColor, heatmapActive]);

  const heatmapData = useMemo(() => {
    if (riverSegments.length === 0) return [];

    return riverSegments
      .map((cell) => {
        const count = filteredOccurrences.filter((o) => {
          if (!selectedSpeciesIds.includes(o.speciesId)) return false;
          const [sw, ne] = cell.bounds;
          return o.location[0] >= sw[0] && o.location[0] <= ne[0] && o.location[1] >= sw[1] && o.location[1] <= ne[1];
        }).length;

        return count > 0 ? { center: cell.center, count } : null;
      })
      .filter(Boolean);
  }, [riverSegments, filteredOccurrences, selectedSpeciesIds]);

  const heatmapMax = useMemo(() => Math.max(...heatmapData.map((h) => h.count), 1), [heatmapData]);

  const speciesComparison = useMemo(() => {
    if (scoredSegments.length === 0) return [];

    const bestCell = scoredSegments[0];

    return species.map((sp) => {
      const occCount = occurrences.filter((o) => {
        if (o.speciesId !== sp.id) return false;
        const [sw, ne] = bestCell.bounds;
        return o.location[0] >= sw[0] && o.location[0] <= ne[0] && o.location[1] >= sw[1] && o.location[1] <= ne[1];
      }).length;

      const prob = calculateProbability(bestCell, sp, selectedClimate, occCount, dischargeData);
      return { id: sp.id, name: spName(sp, lang), color: sp.color, probability: prob, activity: sp.activity };
    }).sort((a, b) => b.probability - a.probability);
  }, [scoredSegments, species, selectedClimate, occurrences, dischargeData]);

  const bestSegment = scoredSegments[0] || null;

  // DESACOPLADO: o app NÃO espera mais a geometria do Rio Santa Lucía (export.geojson,
  // herança do MVP). O mapa, a rede oficial por bacia e a UI aparecem imediatamente; a
  // Santa Lucía carrega em background (setSantaLuciaGeometry) e preenche o heatmap quando
  // pronta. Se o export.geojson falhar (geojsonStatus 'error'), o resto segue funcionando.

  return (
    <>
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/logo.png" alt="Pescamon" className="topbar-logo" />
      </div>
      <nav className="topbar-nav">
        <button
          onClick={() => setActivePage('app')}
          style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700, background: activePage === 'app' ? 'var(--accent-bg)' : 'transparent', border: '1px solid ' + (activePage === 'app' ? 'var(--accent-border)' : 'transparent'), color: activePage === 'app' ? 'var(--accent-light)' : 'var(--text-muted)', borderRadius: 999, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          🗺️ Mapa
        </button>
        <button
          onClick={() => setActivePage('social')}
          style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700, background: activePage === 'social' ? 'var(--accent-bg)' : 'transparent', border: '1px solid ' + (activePage === 'social' ? 'var(--accent-border)' : 'transparent'), color: activePage === 'social' ? 'var(--accent-light)' : 'var(--text-muted)', borderRadius: 999, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          👥 Comunidade
        </button>
        <button
          onClick={() => setActivePage('pescademia')}
          style={{ padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700, background: activePage === 'pescademia' ? 'var(--accent-bg)' : 'transparent', border: '1px solid ' + (activePage === 'pescademia' ? 'var(--accent-border)' : 'transparent'), color: activePage === 'pescademia' ? 'var(--accent-light)' : 'var(--text-muted)', borderRadius: 999, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          🎓 Pescademia
        </button>
      </nav>
      <div className="topbar-auth">
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          style={{ padding: '6px 10px', fontSize: '1rem', background: 'var(--bg-card2)', border: '1px solid var(--border-faint2)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', marginRight: '0.25rem', display: 'flex', alignItems: 'center', transition: 'background 0.15s' }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          onClick={() => setShowOnboarding(true)}
          title="Tutorial"
          style={{ padding: '6px 10px', fontSize: '0.85rem', background: 'var(--bg-card2)', border: '1px solid var(--border-faint2)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', marginRight: '0.5rem' }}
        >
          ?
        </button>
        <button
          className="topbar-moderator-btn"
          onClick={() => setIsModerator(!isModerator)}
          style={{
            padding: '6px 12px',
            fontSize: '0.75rem',
            background: isModerator ? '#22c55e' : '#64748b',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            marginRight: '0.5rem'
          }}
          title={isModerator ? 'Modo moderador ativo' : 'Ativar modo moderador'}
        >
          {isModerator ? '👮 Moderador' : '👤 Usuário'}
        </button>
        {isModerator && (
          <button
            className="topbar-env-btn"
            onClick={() => setEnvDashboardOpen(true)}
            style={{
              padding: '6px 10px', fontSize: '0.75rem',
              background: 'rgba(34,211,238,0.12)',
              color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)',
              borderRadius: 4, cursor: 'pointer', marginRight: '0.5rem',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            title="Dashboard Ambiental"
          >
            🌊 Ambiental
          </button>
        )}
        {/* Seletor de país */}
        <div style={{ position: 'relative', marginRight: 8 }}>
          <button
            type="button"
            onClick={() => setCountryDropdownOpen(v => !v)}
            title="Selecionar país"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 6,
              border: '1px solid var(--border-faint2)',
              background: countryDropdownOpen ? 'rgba(59,130,246,0.15)' : 'var(--bg-card2)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <img
              src={COUNTRIES.find(c => c.id === selectedCountry)?.flagUrl}
              alt={selectedCountry}
              style={{ width: 20, height: 14, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.78rem' }}>
              {COUNTRIES.find(c => c.id === selectedCountry)?.name}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6, transform: countryDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {countryDropdownOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 9999,
              background: 'var(--bg-surface)', border: '1px solid var(--border-faint2)', borderRadius: 8,
              overflow: 'hidden', boxShadow: 'var(--shadow-modal)', minWidth: 170,
            }}>
              {COUNTRIES.map(c => {
                const isActive = c.id === selectedCountry;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.available}
                    onClick={() => {
                      if (!c.available) return;
                      setSelectedCountry(c.id);
                      saveCountry(c.id);
                      setCountryDropdownOpen(false);
                      setSelectedWatercourseIds([]);
                      setSelectedRegion(null);
                      setActiveBasins(new Set());
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                      padding: '9px 12px',
                      background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border-faint)',
                      color: !c.available ? 'var(--text-dimmer)' : isActive ? '#60a5fa' : 'var(--text-primary)',
                      cursor: c.available ? 'pointer' : 'not-allowed', textAlign: 'left',
                    }}
                  >
                    <img src={c.flagUrl} alt={c.id} style={{ width: 24, height: 17, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: isActive ? 700 : 400 }}>{c.name}</span>
                    {isActive && <span style={{ fontSize: '0.68rem', color: '#3b82f6' }}>✓</span>}
                    {!c.available && (
                      <span style={{
                        fontSize: '0.62rem', background: 'var(--bg-card2)', color: 'var(--text-dim)',
                        padding: '2px 5px', borderRadius: 3, border: '1px solid var(--border-faint2)', whiteSpace: 'nowrap',
                      }}>Em breve</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Seletor de idioma — dropdown */}
        <LangDropdown />

        {authSession && 'PushManager' in window && (
          <button
            title={pushSubscribed ? 'Desativar notificações push' : 'Ativar notificações push de pesca'}
            onClick={() => pushSubscribed ? pushUnsubscribe() : pushSubscribe()}
            disabled={pushSubscribing}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: pushSubscribed ? 'var(--accent-light)' : 'var(--text-muted)', padding: '4px 6px', borderRadius: 8, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            type="button"
          >
            {pushSubscribed ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
        )}
        {authSession ? (
          <PremiumBadge userId={authSession.user.id} onClick={() => setDashboardOpen(true)} authSession={authSession} />
        ) : (
          <button className="topbar-login-btn" onClick={() => setAuthModalOpen(true)} type="button">
            <LogIn size={14} /> {t('login')}
          </button>
        )}
      </div>
    </header>

    {/* Onboarding tutorial */}
    {showOnboarding && <OnboardingTutorial onClose={() => setShowOnboarding(false)} />}

    {/* Mobile hamburger */}
    <button className="mobile-menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">☰</button>

    {/* Mobile overlay */}
    <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

    <main className="app-shell">
      <section className={`hero-panel${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo.png" alt="Pescamon" className="logo" style={{ width: 180, height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(245, 200, 0, 0.3))' }} />
          <span className="sidebar-title" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f5c800', textShadow: '0 1px 6px rgba(245, 200, 0, 0.4)', margin: 0, fontSize: '1.1rem', fontWeight: 900, lineHeight: 1.2 }}>{t('sidebarTagline')}</span>
        </div>
        <p>{t('sidebarIntro')}</p>

        {pushPermission === 'default' && (
          <div className="push-permission-banner">
            <Bell size={14} />
            <span>{t('pushBannerText')}</span>
            <button type="button" onClick={pushRequestPermission}>{t('pushBannerBtn')}</button>
          </div>
        )}

        {/* Seletor hierárquico de local de pesca */}
        {(() => {
          const wcLabelMap = {
            pt: { rio:'Rio', canada:'Cañada', quebrada:'Quebrada', canal:'Canal', lagoon:'Lagoa', default:'Arroio' },
            es: { rio:'Río', canada:'Cañada', quebrada:'Quebrada', canal:'Canal', lagoon:'Laguna', default:'Arroyo' },
            en: { rio:'River', canada:'Stream', quebrada:'Creek', canal:'Canal', lagoon:'Lake', default:'Creek' },
          }[lang] || { rio:'Rio', canada:'Cañada', quebrada:'Quebrada', canal:'Canal', lagoon:'Lagoa', default:'Arroio' };
          const wcLabel = tp => wcLabelMap[tp] || wcLabelMap.default;
          const wcIcon  = tp => tp === 'rio' ? '🌊' : tp === 'canada' ? '🌿' : tp === 'quebrada' ? '⛰️' : tp === 'canal' ? '🏗️' : tp === 'lagoon' ? '💧' : '〰️';

          // Mapa: watercourseId → região (IDs explícitos têm prioridade)
          const wcToRegion = {};
          for (const r of REGIONS) {
            for (const id of (r.watercourseIds || [])) wcToRegion[id] = r.id;
            if (r.matchTributaries) wcToRegion['__santa_lucia__'] = r.id; // __santa_lucia__ agora em bacia_plata
          }

          // Classificação geográfica por centroide para tributários sem ID registrado.
          // Ordem de prioridade: bacias mais específicas antes das mais abrangentes.
          // Bacia Rio Negro é mais abrangente que Rio Uruguai no interior, portanto
          // avaliamos as bacias na ordem definida em REGIONS.
          function regionForCenter(lat, lon) {
            // Prioridade explícita por bbox (ordem: Atlântica, Merín, Plata, Santa Lucía, Negro, Uruguai)
            const priority = ['vertente_atlantica', 'bacia_merin', 'bacia_plata', 'bacia_rio_negro', 'bacia_uruguai'];
            for (const rid of priority) {
              const r = REGIONS.find(r => r.id === rid);
              if (!r?.bbox) continue;
              const { minLat, maxLat, minLon, maxLon } = r.bbox;
              if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) return rid;
            }
            return 'bacia_rio_negro'; // fallback: interior
          }

          // Distribui watercourseList por região
          // — IDs explícitos (EXTRA_RIVERS, __santa_lucia__) usam wcToRegion
          // — tributários carregados dos GeoJSONs têm regionId embutido
          // — fallback: classificação geográfica por centroide
          const byRegion = {};
          for (const w of watercourseList) {
            let rid = wcToRegion[w.id];
            if (!rid && w.regionId) rid = w.regionId;
            if (!rid && w.center) rid = regionForCenter(w.center[0], w.center[1]);
            rid = rid || 'bacia_plata';
            if (!byRegion[rid]) byRegion[rid] = [];
            byRegion[rid].push(w);
          }
          // Ordena cada grupo por distância
          for (const rid of Object.keys(byRegion)) {
            byRegion[rid].sort((a, b) => a.distKm - b.distKm);
          }

          // Calcula distância mínima de cada região para ordenar regiões por proximidade
          const regionDist = {};
          for (const r of REGIONS) {
            const items = byRegion[r.id] || [];
            regionDist[r.id] = items.length > 0 ? items[0].distKm : 9999;
          }
          const sortedRegions = [...REGIONS].sort((a, b) => regionDist[a.id] - regionDist[b.id]);

          const selectedText = selectedWatercourseIds.length === 0
            ? t('selectLocation')
            : selectedWatercourseIds.length === 1
              ? (selectedWatercourses[0]?.name ?? `1 ${t('oneLocation')}`)
              : `${selectedWatercourseIds.length} ${t('locationsSelected')}`;

          return (
            <div className="control-block">
              <span className="control-label">📍 {t('fishingLocation')} ({selectedWatercourseIds.length} {selectedWatercourseIds.length !== 1 ? t('selecteds') : t('selected')})</span>
              <div className="species-dropdown">
                {/* Botão toggle */}
                <button className="species-dropdown-toggle" onClick={() => { setWatercourseDropdownOpen(v => !v); setWatercourseSearch(''); }} type="button">
                  <span style={{fontSize:'1rem',marginRight:6}}>
                    {selectedWatercourseIds.length === 0 ? '🗺️' : selectedWatercourseIds.length === 1 ? wcIcon(selectedWatercourses[0]?.type) : '📍'}
                  </span>
                  <span style={{flex:1,textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selectedText}</span>
                  {selectedWatercourseIds.length > 0 && (
                    <span onClick={e => { e.stopPropagation(); setSelectedWatercourseIds([]); }} style={{background:'transparent',border:'none',color:'#64748b',cursor:'pointer',padding:'0 4px',fontSize:'0.9rem',lineHeight:1}} title="Limpar seleção">✕</span>
                  )}
                  <ChevronDown size={14} className={`dd-arrow${watercourseDropdownOpen ? ' open' : ''}`} />
                </button>

                {watercourseDropdownOpen && (
                  <div className="species-dropdown-list" style={{maxHeight:400}}>
                    {/* Busca */}
                    <div style={{padding:'6px 8px', borderBottom:'1px solid rgba(255,255,255,0.08)', position:'sticky', top:0, background:'#0a1929', zIndex:2}}>
                      <input
                        autoFocus
                        type="text"
                        placeholder={`🔍 ${t('searchLocation')}`}
                        value={watercourseSearch}
                        onChange={e => setWatercourseSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{width:'100%', padding:'6px 10px', borderRadius:6, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', color:'#e5f6ff', fontSize:'0.82rem', outline:'none'}}
                      />
                    </div>

                    {/* Modo busca — lista plana filtrada */}
                    {watercourseSearch ? (
                      <div>
                        {watercourseList
                          .filter(w => w.name.toLowerCase().includes(watercourseSearch.toLowerCase()))
                          .slice(0, 30)
                          .map(w => {
                            const isSelected = selectedWatercourseIds.includes(w.id);
                            return (
                              <WatercourseItem key={w.id} w={w} isSelected={isSelected} wcLabel={wcLabel} wcIcon={wcIcon}
                                watercourseList={watercourseList}
                                onToggle={() => {
                                  const adding = !selectedWatercourseIds.includes(w.id);
                                  setSelectedWatercourseIds(prev => adding ? [...prev, w.id] : prev.filter(x => x !== w.id));
                                  if (adding && w.paths?.length > 0) {
                                    const flat = w.paths.flat();
                                    const lats = flat.map(p => p[0]);
                                    const lons = flat.map(p => p[1]);
                                    setMapBounds({ sw: [Math.min(...lats), Math.min(...lons)], ne: [Math.max(...lats), Math.max(...lons)], _ts: Date.now() });
                                  }
                                }}
                                onReport={() => { setReportTarget({ id: w.id, name: w.name, type: w.type, currentQuality: w.waterQuality, currentIsReal: w.waterQualityIsReal }); setReportModalOpen(true); }}
                                onEnvReport={() => setEnvReportTarget(w)}
                              />
                            );
                          })}
                        {watercourseList.filter(w => w.name.toLowerCase().includes(watercourseSearch.toLowerCase())).length === 0 && (
                          <div style={{padding:'12px 14px',color:'#475569',fontSize:'0.8rem'}}>Nenhum local encontrado</div>
                        )}
                      </div>
                    ) : (
                      /* Modo hierárquico — macro-regiões expansíveis */
                      <div>
                        {/* Opção "nenhum" */}
                        <button className={`species-dropdown-item${selectedWatercourseIds.length === 0 ? ' selected' : ''}`} onClick={() => setSelectedWatercourseIds([])} type="button">
                          <span className="dd-check">{selectedWatercourseIds.length === 0 && <Check size={10} />}</span>
                          <span style={{fontSize:'1rem'}}>🗺️</span>
                          <span className="dd-item-info"><strong>Explorar mapa</strong><small>Sem heatmap — veja todos os cursos</small></span>
                        </button>

                        {sortedRegions.map(r => {
                          const items = byRegion[r.id] || [];
                          if (items.length === 0) return null;
                          const rDist = regionDist[r.id];
                          const regionSelected = items.some(w => selectedWatercourseIds.includes(w.id));
                          const isExpanded = selectedRegion === r.id;
                          return (
                            <div key={r.id}>
                              {/* Cabeçalho da macro-região */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRegion(isExpanded ? null : r.id);
                                }}
                                style={{
                                  width:'100%', display:'flex', alignItems:'center', gap:8,
                                  padding:'8px 12px', background: isExpanded ? 'rgba(34,211,238,0.08)' : regionSelected ? 'rgba(26,111,212,0.1)' : 'transparent',
                                  border:'none', borderTop:'1px solid rgba(255,255,255,0.06)',
                                  color: isExpanded ? '#22d3ee' : regionSelected ? '#60a5fa' : '#cbd5e1',
                                  cursor:'pointer', textAlign:'left',
                                }}
                              >
                                <span style={{fontSize:'1rem'}}>{r.emoji}</span>
                                <span style={{flex:1}}>
                                  <span style={{fontWeight:600,fontSize:'0.82rem'}}>{r.name}</span>
                                  <span style={{marginLeft:6,fontSize:'0.7rem',color:'#64748b'}}>
                                    {rDist < 1 ? `${Math.round(rDist*1000)}m` : rDist < 9999 ? `${rDist.toFixed(0)}km` : ''}
                                    {' · '}{items.length} {items.length !== 1 ? t('locationPlural') : t('oneLocation')}
                                  </span>
                                </span>
                                {regionSelected && <span style={{fontSize:'0.65rem',padding:'2px 6px',background:'#1a6fd4',borderRadius:8,color:'#fff'}}>✓</span>}
                                <ChevronDown size={12} style={{transition:'transform 180ms',transform: isExpanded ? 'rotate(180deg)' : 'none',color:'#64748b'}} />
                              </button>

                              {/* Submenu da região */}
                              {isExpanded && (
                                <div style={{paddingLeft:8, borderLeft:'2px solid rgba(34,211,238,0.2)', marginLeft:12}}>
                                  {/* Botão "Selecionar toda a região" */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ids = r.matchTributaries ? ['__santa_lucia__'] : r.watercourseIds;
                                      const allSelected = ids.every(id => selectedWatercourseIds.includes(id));
                                      setSelectedWatercourseIds(prev => allSelected
                                        ? prev.filter(id => !ids.includes(id))
                                        : [...new Set([...prev, ...ids])]
                                      );
                                      if (!allSelected) {
                                        setMapBounds(null);
                                        setFocusedCell({ center: r.center, zoom: r.zoom, _ts: Date.now() });
                                      }
                                    }}
                                    style={{width:'100%',padding:'5px 10px',background:'rgba(34,211,238,0.06)',border:'none',borderRadius:4,color:'#22d3ee',fontSize:'0.72rem',cursor:'pointer',textAlign:'left',margin:'2px 0'}}
                                  >
                                    ☑️ Selecionar toda a região
                                  </button>
                                  {items.map(w => {
                                    const isSelected = selectedWatercourseIds.includes(w.id);
                                    return (
                                      <WatercourseItem key={w.id} w={w} isSelected={isSelected} wcLabel={wcLabel} wcIcon={wcIcon}
                                        watercourseList={watercourseList}
                                        onToggle={() => {
                                          const adding = !selectedWatercourseIds.includes(w.id);
                                          setSelectedWatercourseIds(prev => adding ? [...prev, w.id] : prev.filter(x => x !== w.id));
                                          if (adding && w.paths?.length > 0) {
                                            const flat = w.paths.flat();
                                            const lats = flat.map(p => p[0]);
                                            const lons = flat.map(p => p[1]);
                                            setMapBounds({ sw: [Math.min(...lats), Math.min(...lons)], ne: [Math.max(...lats), Math.max(...lons)], _ts: Date.now() });
                                          }
                                        }}
                                        onReport={() => { setReportTarget({ id: w.id, name: w.name, type: w.type, currentQuality: w.waterQuality, currentIsReal: w.waterQualityIsReal }); setReportModalOpen(true); }}
                                        onEnvReport={() => setEnvReportTarget(w)}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div className="control-block">
          <span className="control-label">{t('chooseFish')} ({selectedSpeciesIds.length} {selectedSpeciesIds.length !== 1 ? t('selectedN') : t('selected1')})</span>
          <div className="species-dropdown">
            <button className="species-dropdown-toggle" onClick={() => setSpeciesDropdownOpen(!speciesDropdownOpen)} type="button">
              <span className="dd-swatches">
                {selectedSpeciesList.map((sp) => (
                  <span key={sp.id} className="dd-swatch" style={{ backgroundColor: getSpeciesColor(sp) }} />
                ))}
              </span>
              <span>{selectedSpeciesList.length === 0 ? t('selectSpecies') : selectedSpeciesList.length === 1 ? spName(selectedSpecies, lang) : `${selectedSpeciesList.length} ${lang === 'en' ? 'fish' : lang === 'es' ? 'peces' : 'peixes'}`}</span>
              <ChevronDown size={14} className={`dd-arrow${speciesDropdownOpen ? ' open' : ''}`} />
            </button>
            {speciesDropdownOpen && (
              <div className="species-dropdown-list">
                {availableSpecies.map((item) => {
                  const isSelected = selectedSpeciesIds.includes(item.id);
                  return (
                    <button key={item.id} className={`species-dropdown-item${isSelected ? ' selected' : ''}`} onClick={() => toggleSpecies(item.id)} type="button">
                      <span className="dd-check">{isSelected && <Check size={10} />}</span>
                      <span className="dd-item-swatch" style={{ backgroundColor: getSpeciesColor(item) }}>
                        <input type="color" className="species-color-picker" value={getSpeciesColor(item)} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); updateSpeciesColor(item.id, e.target.value); }} />
                      </span>
                      <span className="dd-item-icon">
                        <FishIcon speciesId={item.id} color={getSpeciesColor(item)} size={36} />
                      </span>
                      <span className="dd-item-info">
                        <strong>{spName(item, lang)}</strong>
                        <small>{item.scientificName} · {item.size}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {(selectedWatercourses.length > 0 || scoredSegments.length > 0) && (
          <div className="control-block nav-shortcuts">
            {selectedWatercourses.length > 0 && (
              <button
                className="nav-shortcut-btn"
                type="button"
                onClick={() => {
                  const flat = selectedWatercourses.flatMap((w) => w.paths.flat());
                  if (flat.length === 0) return;
                  const lats = flat.map(p => p[0]);
                  const lons = flat.map(p => p[1]);
                  setMapBounds({ sw: [Math.min(...lats), Math.min(...lons)], ne: [Math.max(...lats), Math.max(...lons)], _ts: Date.now() });
                  document.querySelector('.map-resizable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <MapPinned size={13} />
                {selectedWatercourses.length === 1 ? `Ir para ${selectedWatercourses[0].name}` : `Ir para ${selectedWatercourses.length} locais`}
              </button>
            )}
            {heatmapActive && (
              <button
                className="nav-shortcut-btn nav-shortcut-btn--accent"
                type="button"
                onClick={() => {
                  const best = [...scoredTributarySegments, ...scoredSegments]
                    .sort((a, b) => b.probability - a.probability)[0];
                  if (best) navigateToCell(best);
                }}
              >
                <Crosshair size={13} />
                Ir para ponto chave
              </button>
            )}
          </div>
        )}

        <div className="control-block">
          <span className="control-label">Cenário climático</span>
          <div className="climate-grid">
            {climateScenarios.map((item) => (
              <button className={`chip${item.id === selectedClimateId ? ' active' : ''}${item.live ? ' live' : ''}`} key={item.id} onClick={() => setSelectedClimateId(item.id)} type="button">
                {item.live ? `⚡ ${item.name}` : item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="control-block">
          <WeekForecastWidget
            forecast={weekForecast}
            selectedSpecies={selectedSpecies}
            loading={weekForecastLoading}
          />
        </div>

        <div className="control-block">
          <PredictiveAlerts
            occurrences={occurrences}
            speciesList={species}
            currentWeather={{ temperature: selectedClimate?.airTemperature }}
            selectedSpeciesIds={selectedSpeciesIds}
          />
        </div>

        <div className="control-block">
          <CustomAlerts
            authSession={authSession}
            speciesList={species}
            watercourseList={watercourseList}
            occurrences={occurrences}
            showPaywall={showPaywall}
          />
        </div>

        <div className="control-block">
          <span className="control-label">Segmentos morfológicos — {riverSegments.length} locais no Rio Santa Lucía · {tributarySegments.length} em afluentes</span>
          <div className="slider-labels">
            <span>Segmentação por curvatura e comprimento real</span>
            <span></span>
          </div>
        </div>

        {heatmapActive && bestSegment ? (
          <div className="insight-card">
            <div className="insight-icon"><MapPinned size={22} /></div>
            <div>
              <span>Maior incidência estimada</span>
              <strong className="cell-link" onClick={() => navigateToCell(bestSegment)} title="Ver no mapa">{bestSegment.name}</strong>
              <p>{bestSegment.probability}% para {selectedSpeciesList.length > 1 ? `${selectedSpeciesList.length} espécies (média)` : selectedSpecies.name} em cenário de {selectedClimate.name.toLowerCase()}.</p>
              <p className="insight-range">Heatmap: {probRange.min}% – {probRange.max}% (escala adaptativa)</p>
            </div>
          </div>
        ) : !heatmapActive ? (
          <div className="insight-card" style={{opacity:0.7}}>
            <div className="insight-icon" style={{opacity:0.5}}><Fish size={22} /></div>
            <div>
              <span>Mapa de calor inativo</span>
              <strong style={{color:'#94a3b8',cursor:'default'}}>Selecione um peixe para ativar</strong>
              <p style={{color:'#64748b'}}>Escolha o local e as espécies desejadas acima para ver a probabilidade em cada trecho do curso d'água.</p>
            </div>
          </div>
        ) : null}

        {Object.keys(favoriteCells).length > 0 && (
          <div className="insight-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span style={{ fontSize: '1.1rem' }}>★</span>
              <strong style={{ flex: 1, fontSize: '0.82rem', color: '#fde68a' }}>Locais favoritos</strong>
            </div>
            <div className="fav-cells-list" style={{ width: '100%' }}>
              {Object.entries(favoriteCells).map(([cellId, fav]) => {
                const cell = scoredSegments.find((s) => s.id === cellId) || riverSegments.find((s) => s.id === cellId);
                if (!cell) return null;
                return (
                  <div key={cellId} className="fav-cell-row" onClick={() => navigateToCell(cell)}>
                    <div style={{ flex: 1 }}>
                      <div className="fav-cell-label">{fav.label || getCellDisplayName(cell)}</div>
                      <div className="fav-cell-code">{cell.code}{cell.probability != null ? ` · ${cell.probability}%` : ''}</div>
                    </div>
                    <button
                      type="button"
                      className="fav-cell-remove"
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(cell); }}
                      title="Remover favorito"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="control-block">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={`chip register-btn${registering ? ' active' : ''}`} onClick={() => { setRegistering(!registering); setPendingLocation(null); }} type="button">
              {registering ? <><Crosshair size={16} /> Clique no mapa para registrar</> : <><Plus size={16} /> Registrar ocorrência de {selectedSpecies.name}</>}
            </button>
            <button
              type="button"
              onClick={() => setFishIdOpen(true)}
              title="Identificar espécie por foto"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(34,211,238,0.35)',
                background: 'rgba(34,211,238,0.08)', color: '#22d3ee',
                fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              🔍 Identificar por foto
            </button>
          </div>
          {registering && <small className="register-hint">Clique no mapa para marcar o local da captura. A espécie selecionada será registrada.</small>}
          <div className="occurrence-actions">
            <small className="occurrence-count">{occurrences.length} ocorrência{occurrences.length !== 1 ? 's' : ''}</small>
            <button className="chip-sm" onClick={() => exportOccurrencesJSON(occurrences)} disabled={occurrences.length === 0} type="button"><Download size={13} /> Exportar</button>
            <button className="chip-sm" onClick={() => fileInputRef.current?.click()} type="button"><Upload size={13} /> Importar</button>
            <button className={`chip-sm sync-btn ${syncStatus}`} onClick={manualSync} disabled={syncStatus === 'syncing'} type="button">
              {syncStatus === 'syncing' ? <><RefreshCw size={13} className="spin" /> Sincronizando</> :
               syncStatus === 'synced' ? <><Cloud size={13} /> Sync OK</> :
               syncStatus === 'offline' ? <><CloudOff size={13} /> Offline</> :
               <><RefreshCw size={13} /> Sincronizar</>}
            </button>
            <Suspense fallback={null}><PdfExport selectedSpecies={selectedSpecies} bestSegment={bestSegment} scoredSegments={scoredSegments} occurrences={occurrences} probRange={probRange} dischargeData={dischargeData} selectedClimate={selectedClimate} /></Suspense>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </div>
        </div>
      </section>

      <ResizableBox
        key={mapSize.height}
        className={`map-resizable${registering ? ' registering' : ''}`}
        width={Infinity}
        height={mapSize.height}
        minConstraints={[300, 300]}
        maxConstraints={[Infinity, 1200]}
        resizeHandles={['s', 'se']}
        onResize={handleMapResize}
        axis="y"
      >
        <div className="map-resizable-inner">
          <div className="map-drag-header">
            <span className="drag-handle"><GripVertical size={16} /></span>
            <span className="map-title">Mapa de Pesca</span>
            <button
              type="button"
              className={`map-toggle-btn${showSnapAreas ? ' active' : ''}`}
              onClick={() => setShowSnapAreas((v) => !v)}
              title="Áreas de proteção ambiental"
            >
              <Sprout size={13} /> APAs
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className={`map-toggle-btn${showWatercourses ? ' active' : ''}`}
                onClick={() => { setShowWatercourses(v => !v); setBasinDropdownOpen(v => !v); }}
                title="Mostrar/ocultar cursos d'água"
              >
                <Droplets size={13} /> Cursos {showWatercourses ? '▲' : '▼'}
              </button>
              {basinDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 9999,
                  background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                  padding: '6px 4px', minWidth: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}>
                  {(BASINS_BY_COUNTRY[selectedCountry] || BASINS_BY_COUNTRY['UY']).map(b => (
                    <div
                      key={b.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveBasins(prev => {
                          const next = new Set(prev);
                          next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                          return next;
                        });
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                        background: activeBasins.has(b.id) ? 'rgba(255,255,255,0.08)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{b.emoji}</span>
                      <span style={{ flex: 1, fontSize: '0.78rem', color: '#e2e8f0' }}>{b.name}</span>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: activeBasins.has(b.id) ? b.color : '#334155',
                        border: `2px solid ${b.color}`, flexShrink: 0
                      }} />
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #1e293b', margin: '4px 0' }} />
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const basins = BASINS_BY_COUNTRY[selectedCountry] || BASINS_BY_COUNTRY['UY'];
                      setActiveBasins(prev =>
                        prev.size === basins.length ? new Set() : new Set(basins.map(b => b.id))
                      );
                    }}
                    style={{ padding: '5px 10px', fontSize: '0.72rem', color: '#64748b', cursor: 'pointer', textAlign: 'center' }}
                  >
                    {activeBasins.size === (BASINS_BY_COUNTRY[selectedCountry] || BASINS_BY_COUNTRY['UY']).length ? 'Desmarcar todas' : 'Selecionar todas'}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`map-toggle-btn${showFishingSpots ? ' active' : ''}`}
              onClick={() => setShowFishingSpots((v) => !v)}
              title="Postos de pesca da comunidade"
            >
              <MapPin size={13} /> Postos
            </button>
          </div>
          <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom className="map" style={{ height: '100%' }}>
          {console.log('[DEBUG] MapContainer render - mapCenter:', mapCenter, 'mapZoom:', mapZoom)}
          <MapController focusedCell={focusedCell} mapBounds={mapBounds} country={selectedCountry} />
          {theme === 'light'
            ? <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            : <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          }
          <MapClickHandler onMapClick={handleMapClick} registering={registering} />
          <SpotClickHandler onRightClick={(lat, lng) => { setSpotModal({ lat, lng }); setSpotForm({ name:'', description:'', access_type:'bank', species_ids:[], species_names:[] }); }} />
          
          {/* IoT Sensors Layer */}
          {iotSensors.map(sensor => (
            <CircleMarker
              key={sensor.id}
              center={[sensor.lat, sensor.lng]}
              radius={8}
              pathOptions={{
                fillColor: sensor.water_temp ? '#06b6d4' : '#94a3b8',
                color: '#fff',
                weight: 2,
                fillOpacity: 0.9
              }}
            >
              <Popup className="dark-popup">
                <div style={{ color: '#e5f6ff' }}>
                  <strong style={{ color: '#22d3ee', fontSize: '1rem' }}>📡 {sensor.name}</strong>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    {sensor.water_temp !== null && (
                      <div>🌡️ Temperatura: <strong>{sensor.water_temp.toFixed(1)}°C</strong></div>
                    )}
                    {sensor.water_level !== null && (
                      <div>📊 Nível: <strong>{sensor.water_level.toFixed(2)}m</strong></div>
                    )}
                    {sensor.battery !== null && (
                      <div style={{ marginTop: '0.25rem', color: sensor.battery < 20 ? '#ef4444' : '#94a3b8' }}>
                        🔋 Bateria: {sensor.battery}%
                      </div>
                    )}
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      Atualizado: {sensor.updated_at ? new Date(sensor.updated_at).toLocaleString('pt-BR') : 'N/A'}
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          
          {/* SNAP — Áreas Protegidas do Uruguai (polígonos por categoria) */}
          {showSnapAreas && selectedCountry === 'UY' && SNAP_AREAS.map(area => {
            const catCfg = {
              parque_nacional:   { color: '#16a34a', icon: '🏞️', label: t('snapParqueNacional'),       dash: null },
              paisaje_protegido: { color: '#0ea5e9', icon: '🌿', label: t('snapPaisagemProtegida'),   dash: '8 4' },
              monumento_natural: { color: '#a855f7', icon: '🪨', label: t('snapMonumentoNatural'),     dash: '3 3' },
              area_manejo:       { color: '#f59e0b', icon: '🦜', label: t('snapAreaManejo'),          dash: '10 5' },
              reserva_recursos:  { color: '#06b6d4', icon: '💧', label: t('snapReservaRecursos'),   dash: '6 3' },
              zona_captacao:     { color: '#ef4444', icon: '🚱', label: t('snapZonaCaptacao'), dash: '4 4' },
            }[area.category] || { color: '#94a3b8', icon: '🛡️', label: t('snapAreaProtegida'), dash: '5 5' };
            const popup = (
              <Popup className="dark-popup">
                <div style={{ color: '#f1f5f9', minWidth: 210, maxWidth: 270 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: catCfg.color, marginBottom: 4 }}>
                    {catCfg.icon} {area.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>
                    {catCfg.label} · {area.department}
                  </div>
                  <div style={{ fontSize: '0.78rem', marginBottom: 6 }}>{area.description}</div>
                  <div style={{ fontSize: '0.75rem', background: '#1e293b', borderRadius: 6, padding: '5px 8px', borderLeft: `3px solid ${catCfg.color}` }}>
                    🎣 <strong>{t('popupFishingRelevance')}:</strong><br />{area.relevance}
                  </div>
                  {area.areaHa && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 6 }}>📐 {area.areaHa.toLocaleString('pt-BR')} {t('popupHa')} · SNAP/MVOTMA</div>
                  )}
                  <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 4, fontStyle: 'italic' }}>🛡️ {t('popupProtectedArea')}</div>
                </div>
              </Popup>
            );
            return (
              <React.Fragment key={area.id}>
                <Polygon
                  positions={area.polygon}
                  pathOptions={{
                    color: catCfg.color,
                    fillColor: catCfg.color,
                    fillOpacity: 0.08,
                    weight: 2,
                    opacity: 0.75,
                    dashArray: catCfg.dash,
                  }}
                >
                  {popup}
                </Polygon>
                <CircleMarker
                  center={area.center}
                  radius={6}
                  pathOptions={{ color: catCfg.color, fillColor: catCfg.color, fillOpacity: 0.9, weight: 1.5, opacity: 1 }}
                >
                  {popup}
                </CircleMarker>
              </React.Fragment>
            );
          })}

          {/* Áreas de preservação carregadas por país (UCs oficiais — ex.: RS/ICMBio).
              Polígonos multi-anel; cor/ícone por categoria; nota de pesca por grupo (PI/US). */}
          {showSnapAreas && protectedAreas.map(area => {
            const UC_CAT = {
              PARQUE: { color: '#16a34a', icon: '🏞️', label: 'Parque' },
              REBIO: { color: '#15803d', icon: '🌳', label: 'Reserva Biológica' },
              ESEC:  { color: '#0d9488', icon: '🔬', label: 'Estação Ecológica' },
              REVIS: { color: '#a855f7', icon: '🦌', label: 'Refúgio de Vida Silvestre' },
              MONA:  { color: '#9333ea', icon: '🪨', label: 'Monumento Natural' },
              APA:   { color: '#0ea5e9', icon: '🌿', label: 'Área de Proteção Ambiental' },
              ARIE:  { color: '#22d3ee', icon: '🌱', label: 'Área de Relevante Interesse Ecológico' },
              FLORESTA: { color: '#ca8a04', icon: '🌲', label: 'Floresta' },
              RESEX: { color: '#f59e0b', icon: '🛶', label: 'Reserva Extrativista' },
              RDS:   { color: '#eab308', icon: '🌾', label: 'Reserva de Desenvolvimento Sustentável' },
              RPPN:  { color: '#84cc16', icon: '🌿', label: 'Reserva Particular (RPPN)' },
            }[area.category] || { color: '#94a3b8', icon: '🛡️', label: area.category || 'Unidade de Conservação' };
            const isPI = area.group === 'PI';
            const pescaNota = isPI
              ? '🚫 Proteção Integral — pesca em geral proibida; consulte o plano de manejo.'
              : '⚠️ Uso Sustentável — pesca pode ser permitida sob regras; consulte o órgão gestor.';
            const popup = (
              <Popup className="dark-popup">
                <div style={{ color: '#f1f5f9', minWidth: 215, maxWidth: 280 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: UC_CAT.color, marginBottom: 4 }}>
                    {UC_CAT.icon} {area.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>
                    {UC_CAT.label} · {area.esfera}{area.group ? ` · ${isPI ? 'Proteção Integral' : 'Uso Sustentável'}` : ''}
                  </div>
                  <div style={{ fontSize: '0.76rem', background: '#1e293b', borderRadius: 6, padding: '6px 9px', borderLeft: `3px solid ${isPI ? '#ef4444' : '#f59e0b'}`, marginBottom: 6 }}>
                    {pescaNota}
                  </div>
                  {area.areaHa != null && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>📐 {area.areaHa.toLocaleString('pt-BR')} ha</div>
                  )}
                  {area.authority && (
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>⚖️ {area.authority}</div>
                  )}
                  <div style={{ fontSize: '0.66rem', color: '#475569', marginTop: 4, fontStyle: 'italic' }}>🛡️ Área protegida · ICMBio/CNUC</div>
                </div>
              </Popup>
            );
            return (
              <React.Fragment key={area.id}>
                {area.rings.map((ring, i) => (
                  <Polygon
                    key={`${area.id}-r${i}`}
                    positions={ring}
                    pathOptions={{ color: UC_CAT.color, fillColor: UC_CAT.color, fillOpacity: 0.08, weight: 2, opacity: 0.75, dashArray: isPI ? null : '8 4' }}
                  >
                    {popup}
                  </Polygon>
                ))}
                <CircleMarker
                  center={area.center}
                  radius={6}
                  pathOptions={{ color: UC_CAT.color, fillColor: UC_CAT.color, fillOpacity: 0.9, weight: 1.5, opacity: 1 }}
                >
                  {popup}
                </CircleMarker>
              </React.Fragment>
            );
          })}

          {/* Postos de pesca da comunidade */}
          {showFishingSpots && fishingSpots.map(spot => {
            const accessIcon = { bank: '🎣', boat: '⛵', wading: '🥾', pier: '🌉' }[spot.access_type] || '🎣';
            const accessLabel = { bank: 'Margem', boat: 'Barco', wading: 'Vadeando', pier: 'Pier/Ponte' }[spot.access_type] || 'Margem';
            return (
              <CircleMarker
                key={spot.id}
                center={[spot.lat, spot.lng]}
                radius={8}
                pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2, opacity: 1 }}
              >
                <Popup className="dark-popup">
                  <div style={{ minWidth: 200, maxWidth: 260, color: '#f1f5f9' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fbbf24', marginBottom: 3 }}>
                      {accessIcon} {spot.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>
                      {accessLabel}{spot.watercourse_name ? ` · ${spot.watercourse_name}` : ''}
                    </div>
                    {spot.description && (
                      <div style={{ fontSize: '0.78rem', marginBottom: 6 }}>{spot.description}</div>
                    )}
                    {spot.species_names?.length > 0 && (
                      <div style={{ fontSize: '0.75rem', background: '#1e293b', borderRadius: 5, padding: '4px 8px', marginBottom: 6 }}>
                        🎣 {spot.species_names.slice(0, 4).join(', ')}{spot.species_names.length > 4 ? '…' : ''}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <button
                        onClick={() => upvoteFishingSpot(spot.id).then(() => getFishingSpots().then(setFishingSpots))}
                        style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 8, border: '1px solid #f59e0b', background: '#1e293b', color: '#fbbf24', cursor: 'pointer' }}
                      >👍 {spot.upvotes || 0}</button>
                      <span style={{ fontSize: '0.65rem', color: '#475569' }}>{new Date(spot.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Mostra cursos das bacias selecionadas ou todos os cursos se nenhuma bacia selecionada */}
          {showWatercourses && <AllWatercourses
            key={`wc-${selectedCountry}-${tributaryLines.length}`}
            tributaryLines={tributaryLines}
            waterQualityData={waterQualityData}
            species={species}
            occurrences={occurrences}
            selectedWatercourseIds={selectedWatercourseIds}
            santaLuciaGeometry={santaLuciaGeometry}
            extraRivers={EXTRA_RIVERS}
            extraRiverGeometries={extraRiverGeometries}
            activeBasins={activeBasins}
            selectedCountry={selectedCountry}
          />}

          {/* Rios e lagoas extras (overlays herói legados) — desativados: a rede oficial
              por bacia já os cobre. Ver SHOW_LEGACY_HERO_RIVERS. */}
          {SHOW_LEGACY_HERO_RIVERS && !heatmapActive && EXTRA_RIVERS.filter(r => (r.country || 'UY') === selectedCountry).map(r => {
            const paths = extraRiverGeometries[r.id];
            if (!paths) return null;
            const isLagoon = r.type === 'lagoon';
            const isEstuary = r.type === 'estuario';
            const wcType = r.type || classifyWatercourse(r.name || '');
            const rSpecies = (SPECIES_BY_WATERCOURSE[wcType] || []).map(id => species.find(s => s.id === id)).filter(Boolean);
            const rQuality = estimateWaterQualityHeuristic(r.name, wcType, r.center?.[0] || 0, r.center?.[1] || 0);
            const rOcc = occurrences.filter(o => o.watercourseId === r.id || o.watercourseName === r.name).length;
            const richPopup = (
              <Popup>
                <div style={{ minWidth: 220, maxWidth: 270, background: '#0f172a', padding: 12, borderRadius: 8, color: '#e5f6ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>{isLagoon ? '🏞️' : isEstuary ? '🌊' : '〰️'}</span>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: r.color || '#38bdf8', display: 'block' }}>{r.name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{isLagoon ? t('popupLakeWetland') : isEstuary ? t('popupEstuary') : t('popupRiverStream')} · {t('popupCountry')}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'5px 8px', background: rQuality < 50 ? 'rgba(239,68,68,0.15)' : rQuality < 65 ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)', borderRadius:6 }}>
                    <Droplets size={13} color={rQuality < 50 ? '#ef4444' : rQuality < 65 ? '#f97316' : '#22c55e'} />
                    <span style={{ fontSize:'0.78rem', color: rQuality < 50 ? '#ef4444' : rQuality < 65 ? '#f97316' : '#22c55e' }}>{t('popupQuality')}: <strong>{rQuality}%</strong> ({t('popupEstimated')})</span>
                  </div>
                  {rSpecies.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize:'0.7rem', color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{t('popupSpecies')} ({rSpecies.length})</div>
                      {rSpecies.slice(0, 5).map(s => (
                        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 0', fontSize:'0.78rem' }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background: s.color, display:'inline-block' }} />
                          <span style={{ flex:1, color:'#e5f6ff' }}>{spName(s, lang)}</span>
                          {BIG_FISH_SPECIES.has(s.id) && <span style={{ color:'#fbbf24', fontSize:'0.7rem' }}>🐟</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {rOcc > 0 && <div style={{ fontSize:'0.72rem', color:'#22c55e' }}>✔ {rOcc} {rOcc > 1 ? t('popupRegisteredPl') : t('popupRegistered')}</div>}
                </div>
              </Popup>
            );
            return paths.map((path, i) =>
              isLagoon ? (
                <Polygon
                  key={`${r.id}-${i}`}
                  positions={path}
                  pathOptions={{ color: r.color, weight: 2.5, opacity: 1, fillColor: r.color, fillOpacity: 0.25 }}
                >
                  {i === 0 ? richPopup : null}
                </Polygon>
              ) : (
                <React.Fragment key={`${r.id}-${i}`}>
                  <Polyline positions={path} pathOptions={{ color: r.color, weight: 12, opacity: 0.18 }} interactive={false} />
                  <Polyline positions={path} pathOptions={{ color: r.color, weight: 4, opacity: 1 }} />
                  <Polyline positions={path} pathOptions={{ color: 'transparent', weight: 24, opacity: 0.001 }}>
                    {i === 0 ? richPopup : null}
                  </Polyline>
                </React.Fragment>
              )
            );
          })}

          {/* Destaque de cursos selecionados independente do heatmap (overlay herói legado) */}
          {SHOW_LEGACY_HERO_RIVERS && selectedCountry === 'UY' && selectedWatercourseIds.includes('__santa_lucia__') && !heatmapActive && santaLuciaGeometry.length > 0 && (() => {
            const slQuality = waterQualityData?.['__santa_lucia__']?.quality_score || estimateWaterQualityHeuristic('Rio Santa Lucía', 'rio', 0, 0);
            const slSpecies = species.filter(s => BIG_FISH_SPECIES.has(s.id)).slice(0, 5);
            const slOcc = occurrences.filter(o => o.watercourseId === '__santa_lucia__' || o.watercourseName === 'Río Santa Lucía').length;
            return (
              <>
                <Polyline positions={santaLuciaGeometry} pathOptions={{ color: '#3b82f6', weight: 12, opacity: 0.18 }} interactive={false} />
                <Polyline positions={santaLuciaGeometry} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.9 }} interactive={false} />
                <Polyline positions={santaLuciaGeometry} pathOptions={{ color: 'transparent', weight: 28, opacity: 0.001 }}>
                  <Popup>
                    <div style={{ minWidth: 220, maxWidth: 270, background: '#0f172a', padding: 12, borderRadius: 8, color: '#e5f6ff' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:'1.2rem' }}>🌊</span>
                        <div>
                          <strong style={{ fontSize:'0.9rem', color:'#38bdf8', display:'block' }}>Río Santa Lucía</strong>
                          <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{t('popupMainRiver')} · {t('popupBasin')} Santa Lucía</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'5px 8px', background: slQuality < 50 ? 'rgba(239,68,68,0.15)' : slQuality < 65 ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)', borderRadius:6 }}>
                        <Droplets size={13} color={slQuality < 50 ? '#ef4444' : slQuality < 65 ? '#f97316' : '#22c55e'} />
                        <span style={{ fontSize:'0.78rem', color: slQuality < 50 ? '#ef4444' : slQuality < 65 ? '#f97316' : '#22c55e' }}>{t('popupQuality')}: <strong>{slQuality}%</strong></span>
                      </div>
                      {slSpecies.length > 0 && (
                        <div style={{ marginBottom:6 }}>
                          <div style={{ fontSize:'0.7rem', color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{t('popupFeaturedSpecies')}</div>
                          {slSpecies.map(s => (
                            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 0', fontSize:'0.78rem' }}>
                              <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'inline-block' }} />
                              <span style={{ flex:1, color:'#e5f6ff' }}>{spName(s, lang)}</span>
                              <span style={{ color:'#fbbf24', fontSize:'0.7rem' }}>🐟</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {slOcc > 0 && <div style={{ fontSize:'0.72rem', color:'#22c55e' }}>✔ {slOcc} {slOcc > 1 ? t('popupRegisteredPl') : t('popupRegistered')}</div>}
                    </div>
                  </Popup>
                </Polyline>
              </>
            );
          })()}
          {!heatmapActive && tributaryLines.filter(t => {
              if (!selectedWatercourseIds.includes(t.id)) return false;
              if (!t.paths?.length) return false;
              // Filtrar por bbox do país
              const countryBbox = COUNTRIES.find(c => c.id === selectedCountry)?.bbox;
              if (!countryBbox) return true;
              const { minLat, maxLat, minLon, maxLon } = countryBbox;
              // Filtragem RIGOROSA: excluir se QUALQUER ponto estiver fora do bbox (evita SC/PR)
              let hasPointsOutside = false;
              for (const seg of t.paths) {
                for (const pt of seg) {
                  if (!(pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon)) {
                    hasPointsOutside = true;
                    break;
                  }
                }
                if (hasPointsOutside) break;
              }
              if (hasPointsOutside) {
                console.log('[DEBUG] 🚫 FILTRANDO (tem pontos fora do RS):', t.name);
                return false;
              }
              return true;
            }).map(t => {
            const tWcType = classifyWatercourse(t.name || '');
            const tSpecies = (SPECIES_BY_WATERCOURSE[tWcType] || []).map(id => species.find(s => s.id === id)).filter(Boolean);
            const tQuality = estimateWaterQualityHeuristic(t.name, tWcType, 0, 0);
            const tOcc = occurrences.filter(o => o.tributaryId === t.id || o.tributaryName === t.name).length;
            return t.paths.map((path, i) => (
              <React.Fragment key={`sel-trib-${t.id}-${i}`}>
                <Polyline positions={path} pathOptions={{ color: '#22d3ee', weight: 10, opacity: 0.15 }} interactive={false} />
                <Polyline positions={path} pathOptions={{ color: '#22d3ee', weight: 3, opacity: 0.9 }} interactive={false} />
                <Polyline positions={path} pathOptions={{ color: 'transparent', weight: 24, opacity: 0.001 }}>
                  {i === 0 ? (
                    <Popup>
                      <div style={{ minWidth: 210, maxWidth: 260, background: '#0f172a', padding: 12, borderRadius: 8, color: '#e5f6ff' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                          <span style={{ fontSize:'1.1rem' }}>〰️</span>
                          <div>
                            <strong style={{ fontSize:'0.88rem', color:'#22d3ee', display:'block' }}>{t.name}</strong>
                            <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{tWcType.charAt(0).toUpperCase() + tWcType.slice(1)} · {t('popupTributary')}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'5px 8px', background: tQuality < 50 ? 'rgba(239,68,68,0.15)' : tQuality < 65 ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)', borderRadius:6 }}>
                          <Droplets size={13} color={tQuality < 50 ? '#ef4444' : tQuality < 65 ? '#f97316' : '#22c55e'} />
                          <span style={{ fontSize:'0.78rem', color: tQuality < 50 ? '#ef4444' : tQuality < 65 ? '#f97316' : '#22c55e' }}>{t('popupQuality')}: <strong>{tQuality}%</strong> ({t('popupEstimated')})</span>
                        </div>
                        {tSpecies.length > 0 && (
                          <div style={{ marginBottom:6 }}>
                            <div style={{ fontSize:'0.7rem', color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{t('popupSpecies')}</div>
                            {tSpecies.slice(0, 4).map(s => (
                              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 0', fontSize:'0.78rem' }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'inline-block' }} />
                                <span style={{ flex:1, color:'#e5f6ff' }}>{spName(s, lang)}</span>
                                {BIG_FISH_SPECIES.has(s.id) && <span style={{ color:'#fbbf24', fontSize:'0.7rem' }}>🐟</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {tOcc > 0 && <div style={{ fontSize:'0.72rem', color:'#22c55e' }}>✔ {tOcc} {tOcc > 1 ? t('popupRegisteredPl') : t('popupRegistered')}</div>}
                      </div>
                    </Popup>
                  ) : null}
                </Polyline>
              </React.Fragment>
            ));
          })}
          
          {heatmapActive && extraRiverBands.map((seg) => (
            <React.Fragment key={`erb-${seg.id}`}>
              {seg.bands.map((band, bi) => (
                bi === 2
                  ? <Polyline key={bi} positions={band.path} pathOptions={{ color: seg.color, weight: band.weight, opacity: band.opacity, lineCap: 'round', lineJoin: 'round' }}>
                      <Popup>
                        <div style={{minWidth: 180, maxWidth: 220}}>
                          <strong style={{fontSize:'0.85rem', display: 'block', marginBottom: 4}}>{seg.popup.name}</strong>
                          <span style={{fontSize:'0.78rem',color:'#94a3b8', display: 'block'}}>Prob.: {seg.popup.probability}%</span>
                        </div>
                      </Popup>
                    </Polyline>
                  : <Polyline key={bi} positions={band.path} pathOptions={{ color: seg.color, weight: band.weight, opacity: band.opacity, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
              ))}
            </React.Fragment>
          ))}
          {heatmapActive && tributaryBands.map((seg) => (
            <React.Fragment key={`tb-${seg.id}`}>
              {seg.bands.map((band, bi) => (
                bi === 2
                  ? <Polyline key={bi} positions={band.path} pathOptions={{ color: seg.color, weight: band.weight, opacity: band.opacity, lineCap: 'round', lineJoin: 'round' }}>
                      <Popup>
                        <div style={{minWidth: 180, maxWidth: 220}}>
                          <strong style={{fontSize:'0.85rem', display: 'block', marginBottom: 4}}>{seg.popup.name}</strong>
                          <span style={{fontSize:'0.78rem',color:'#94a3b8', display: 'block', marginBottom: 8}}>Prob.: {seg.popup.probability}%</span>
                          <button
                            type="button"
                            onClick={() => {
                              const s = seg.popup.seg;
                              const cellData = { id: s.id, name: s.tributaryName, type: s.watercourseType || 'afluente', lat: s.center?.[0], lon: s.center?.[1], isTributaryCell: true, tributaryName: s.tributaryName, probability: s.probability };
                              if (activeSession) { setSelectedSessionLocation(cellData); setCatchModalOpen(true); }
                              else { setSelectedSessionLocation(cellData); setSessionStep('select-location'); setSessionModalOpen(true); }
                            }}
                            style={{ width:'100%', padding:'6px 10px', background: activeSession ? '#22c55e' : '#3b82f6', border:'none', borderRadius:4, color:'#fff', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}
                          >
                            🎣 {activeSession ? 'Registrar Captura' : 'Iniciar Pescaria'}
                          </button>
                        </div>
                      </Popup>
                    </Polyline>
                  : <Polyline key={bi} positions={band.path} pathOptions={{ color: seg.color, weight: band.weight, opacity: band.opacity, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
              ))}
            </React.Fragment>
          ))}
          {heatmapActive && riverBands.map((seg) =>
            seg.bands.map((band, bi) => (
              <Polyline key={`band-${seg.id}-${bi}`} positions={band.path} pathOptions={{ color: seg.color, weight: band.weight, opacity: band.opacity, lineCap: 'round', lineJoin: 'round' }} interactive={false} />
            ))
          )}
          {heatmapActive && scoredSegments.map((cell) => {
            const isFav = !!favoriteCells[cell.id];
            const displayName = getCellDisplayName(cell);
            return (
            <Polyline key={`click-${cell.id}`} positions={cell.path} pathOptions={{ color: 'transparent', weight: 20, opacity: 0 }}>
              <Popup>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                  <strong style={{flex:1}}>{displayName}</strong>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(cell)}
                    title={isFav ? 'Remover dos favoritos' : 'Favoritar este local'}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem',padding:'0 2px',color: isFav ? '#f59e0b' : '#64748b',flexShrink:0}}
                  >{isFav ? '★' : '☆'}</button>
                </div>
                {isFav && favEditId === cell.id ? (
                  <div style={{display:'flex',gap:4,marginBottom:4}}>
                    <input
                      type="text"
                      value={favEditName}
                      onChange={(e) => setFavEditName(e.target.value)}
                      placeholder="Nome personalizado…"
                      style={{flex:1,fontSize:'0.78rem',padding:'2px 6px',borderRadius:4,border:'1px solid #94a3b8',background:'#0d1e2b',color:'#e5f6ff'}}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && saveFavLabel(cell.id)}
                    />
                    <button type="button" onClick={() => saveFavLabel(cell.id)} style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:4,background:'#1a6fd4',border:'none',color:'#fff',cursor:'pointer'}}>OK</button>
                  </div>
                ) : isFav ? (
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    <span style={{fontSize:'0.72rem',color:'#f59e0b'}}>★ Local favorito</span>
                    <button type="button" onClick={() => { setFavEditId(cell.id); setFavEditName(favoriteCells[cell.id]?.label || ''); }} style={{background:'none',border:'none',color:'#7ab8f5',fontSize:'0.72rem',cursor:'pointer',padding:0}}>renomear</button>
                  </div>
                ) : null}
                Probabilidade: {cell.probability}% ({cell.modelType === 'bayesian-ensemble' ? 'bayesiano' : cell.modelType === 'ensemble' ? 'ensemble' : 'heurístico'})<br />
                {cell.modelType !== 'heuristic' && <>Heurístico: {cell.heuristicScore}% · Ensemble: {cell.ensembleScore}%<br /></>}
                {cell.spatialPrior != null && <>Prior espacial: {cell.spatialPrior}% · Posterior: {cell.bayesPosterior}%<br /></>}
                {cell.dischargeEffect !== 0 && <>Vazão: {cell.dischargeEffect > 0 ? '+' : ''}{cell.dischargeEffect}%<br /></>}
                {cell.calibration > 0 && <>Calibração: +{cell.calibration}%<br /></>}
                Ocorrências de {selectedSpecies.name}: {cell.speciesOccurrences}<br />
                Sinuosidade: {cell.sinuosity}%<br />
                Profundidade aprox.: {cell.depth} m<br />
                Vegetação: {Math.round(cell.vegetation * 100)}%<br />
                Oxigenação: {Math.round(cell.oxygen * 100)}%
              </Popup>
            </Polyline>
          );})}

          {heatmapData.map((h, i) => (
            <CircleMarker key={`heat-${i}`} center={h.center} radius={4 + (h.count / heatmapMax) * 10} pathOptions={{ color: activeColor, fillColor: activeColor, fillOpacity: 0.25 + 0.4 * (h.count / heatmapMax), weight: 1.5, opacity: 0.6 }} />
          ))}
          {filteredOccurrences.map((o) => {
            const sp = species.find((s) => s.id === o.speciesId);
            return (
              <Marker key={o.id} position={o.location} icon={occurrenceIcon}>
                <Popup>
                  <strong>{o.speciesName}</strong><br />
                  {new Date(o.date).toLocaleDateString('pt-BR')} {new Date(o.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<br />
                  {o.notes && <>{o.notes}<br /></>}
                  <CaptureValidation
                    occurrenceId={o.id}
                    isOwnCapture={o.deviceId === getDeviceId()}
                  />
                  <button className="popup-delete-btn" onClick={() => deleteOccurrence(o.id)} type="button">Remover</button>
                </Popup>
              </Marker>
            );
          })}
          {iotSensorData?.sensors?.map((s) => {
            const t = s.water_temp || 15;
            const hue = Math.max(0, Math.min(240, (1 - (t - 10) / 20) * 240));
            const color = `hsl(${hue}, 80%, 55%)`;
            return (
              <CircleMarker key={`iot-${s.id}`} center={[s.lat, s.lng]} radius={18} pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 2, opacity: 0.7, dashArray: '4 2' }}>
                <Popup>
                  <strong>📡 {s.name}</strong><br />
                  🌡️ Água: {s.water_temp}°C<br />
                  🌊 Nível: {s.water_level}m<br />
                  🔋 Bateria: {s.battery}%
                </Popup>
              </CircleMarker>
            );
          })}
          {iotSensorData?.sensors?.map((s) => {
            const t = s.water_temp || 15;
            const hue = Math.max(0, Math.min(240, (1 - (t - 10) / 20) * 240));
            const color = `hsl(${hue}, 80%, 55%)`;
            return (
              <CircleMarker key={`iot-aura-${s.id}`} center={[s.lat, s.lng]} radius={35} pathOptions={{ color: 'transparent', fillColor: color, fillOpacity: 0.08, weight: 0 }} />
            );
          })}
          {/* Pins de locais sugeridos pelo relatório preditivo */}
          {(reportSpots || []).map((s, i) => (
            <CircleMarker
              key={`report-spot-${i}`}
              center={[s.lat, s.lng]}
              radius={10}
              pathOptions={{ color: '#a78bfa', fillColor: '#a78bfa', fillOpacity: 0.85, weight: 2, opacity: 1 }}
            >
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong>📊 {s.name}</strong><br />
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{s.type} · {s.distKm} km</span>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {pendingLocation && (
            <Marker position={pendingLocation} icon={occurrenceIcon}>
              <Popup>
                <div className="occurrence-form">
                  <strong>Registrar {selectedSpecies.name}</strong>
                  <input type="text" placeholder="Notas (opcional)" value={occurrenceNotes} onChange={(e) => setOccurrenceNotes(e.target.value)} />
                  <input type="number" placeholder="Peso aprox. em kg (opcional)" min="0" step="0.1" value={occurrenceWeight} onChange={(e) => setOccurrenceWeight(e.target.value)} style={{ marginTop: 4 }} />
                  <input type="text" placeholder="Isca utilizada (opcional)" value={occurrenceBait} onChange={(e) => setOccurrenceBait(e.target.value)} style={{ marginTop: 4 }} />
                  <div className="occurrence-form-actions">
                    <button onClick={confirmOccurrence} type="button">Confirmar</button>
                    <button onClick={cancelOccurrence} type="button">Cancelar</button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
          <MapLegend
            heatmapActive={heatmapActive}
            activeColor={activeColor}
            showSnapAreas={showSnapAreas}
            showWatercourses={showWatercourses}
            showFishingSpots={showFishingSpots}
            iotSensors={iotSensors}
            occurrences={filteredOccurrences}
          />
        </div>
      </ResizableBox>

      <section className="stats-panel">
        <article>
          <ThermometerSun />
          <span>Temperatura da água</span>
          <strong>{selectedClimate.waterTemperature} °C</strong>
        </article>
        <article>
          <Clock />
          <span>Janela analisada</span>
          <strong>{selectedClimate.name}</strong>
        </article>
        <article>
          <Wind />
          <span>Vento</span>
          <strong>{selectedClimate.wind} km/h</strong>
        </article>
        {dischargeData && (
          <article>
            <Droplets />
            <span>Vazão do rio</span>
            <strong>{dischargeData.current} m³/s</strong>
          </article>
        )}
      </section>

      <section className="analysis-panel">
        <div className={`profile-card${collapsedCards['species'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Activity size={18} /> Perfil da{selectedSpeciesList.length > 1 ? 's' : ''} espécie{selectedSpeciesList.length > 1 ? 's' : ''} <button className="collapse-btn" onClick={() => toggleCardCollapse('species')} type="button">{collapsedCards['species'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['species'] && selectedSpeciesList.map((sp) => {
            const vedaInfo = getVedaStatus(sp.id);
            return (
            <div key={sp.id} style={{ marginBottom: selectedSpeciesList.length > 1 ? 10 : 0 }}>
              {vedaInfo && vedaInfo.active && (
                <div style={{ background: vedaInfo.type === 'absoluta' ? '#fef2f2' : '#fff7ed', border: `2px solid ${vedaInfo.type === 'absoluta' ? '#ef4444' : '#f97316'}`, borderRadius: 8, padding: '7px 10px', marginBottom: 8, fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: '1.1rem' }}>{vedaInfo.type === 'absoluta' ? '🚫' : '🟠'}</span>
                  <span>
                    {vedaInfo.type === 'absoluta' ? 'VEDA ABSOLUTA — captura proibida' : `VEDA ATIVA${vedaInfo.daysLeft != null ? ` · ${vedaInfo.daysLeft} dia${vedaInfo.daysLeft !== 1 ? 's' : ''} restante${vedaInfo.daysLeft !== 1 ? 's' : ''}` : ''}`}
                    <span style={{ fontWeight: 400, display: 'block', fontSize: '0.74rem', marginTop: 1 }}>{vedaInfo.veda.authority}</span>
                  </span>
                </div>
              )}
              {vedaInfo && !vedaInfo.active && vedaInfo.daysUntil != null && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span>⏳</span>
                  <span><strong>Veda em {vedaInfo.daysUntil} dia{vedaInfo.daysUntil !== 1 ? 's' : ''}</strong> · {vedaInfo.veda.authority}</span>
                </div>
              )}
              <h2 style={{ fontSize: selectedSpeciesList.length > 1 ? '1rem' : undefined, margin: selectedSpeciesList.length > 1 ? '4px 0' : undefined }}>{spName(sp, lang)}</h2>
              <p><strong>{t('scientificName')}:</strong> <em>{sp.scientificName}</em></p>
              {selectedSpeciesList.length === 1 && sp.nameEs && (
                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: -6 }}>
                  🇧🇷 {sp.namePt} · 🇺🇾 {sp.nameEs} · 🇬🇧 {sp.nameEn}
                </p>
              )}
              {selectedSpeciesList.length === 1 && <>
                <p><strong>{t('feeding')}:</strong> {sp.diet}</p>
                <p><strong>{t('activity')}:</strong> {sp.activity}</p>
                <p>{sp.habits}</p>
              </>}
              {selectedSpeciesList.length > 1 && <p style={{ fontSize: '0.75rem' }}>{sp.diet} · {sp.activity}</p>}
              {sp.conservation && (() => {
                const c = sp.conservation;
                const cfg = {
                  protected:  { bg: '#fef2f2', border: '#fca5a5', color: '#7f1d1d', icon: '🚫', label: 'VEDA / PROTEGIDA' },
                  regulated:  { bg: '#fffbeb', border: '#f59e0b', color: '#78350f', icon: '⚠️', label: 'REGULAMENTADA' },
                  vulnerable: { bg: '#eff6ff', border: '#93c5fd', color: '#1e3a8a', icon: '🔵', label: 'VULNERÁVEL' },
                  invasive:   { bg: '#f0fdf4', border: '#86efac', color: '#14532d', icon: '🌿', label: 'ESPÉCIE INVASORA' },
                }[c.status] || { bg: '#f9fafb', border: '#d1d5db', color: '#1e293b', icon: 'ℹ️', label: 'AVISO' };
                return (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, fontSize: '0.78rem', lineHeight: 1.5, color: cfg.color }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{cfg.icon} {cfg.label}</div>
                    {c.minSize && <div>📏 Tamanho mínimo legal: <strong>{c.minSize} cm</strong></div>}
                    {c.seasonal && <div>📅 {c.seasonal}</div>}
                    <div style={{ marginTop: 3 }}>{c.note}</div>
                    <div style={{ marginTop: 6, color: cfg.color, opacity: 0.7, fontStyle: 'italic' }}>🌿 Pesque com responsabilidade. Respeite as leis ambientais e preserve a biodiversidade dos rios e lagoas do Uruguai.</div>
                  </div>
                );
              })()}
              {(() => {
                const stock = DINARA_STOCK[sp.id];
                if (!stock) return null;
                const scfg = {
                  abundant: { color: '#15803d', bg: '#f0fdf4', border: '#86efac', icon: '📈', label: 'Abundante' },
                  stable:   { color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', icon: '📊', label: 'Estável' },
                  reduced:  { color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: '📉', label: 'Reduzido' },
                  critical: { color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5', icon: '🔴', label: 'Crítico' },
                }[stock.status] || { color: '#475569', bg: '#f8fafc', border: '#e2e8f0', icon: '❓', label: 'Desconhecido' };
                const trendIcon = { stable: '→', declining: '↓', increasing: '↑' }[stock.trend] || '→';
                return (
                  <div style={{ marginTop: 6, padding: '7px 10px', background: scfg.bg, border: `1px solid ${scfg.border}`, borderRadius: 8, fontSize: '0.75rem', lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, color: scfg.color }}>{scfg.icon} Estoque DINARA: {scfg.label} {trendIcon}</span>
                      <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.68rem' }}>ref. {stock.year}</span>
                    </div>
                    <div style={{ color: '#475569' }}>{stock.note}</div>
                    <div style={{ marginTop: 4, color: '#94a3b8', fontSize: '0.68rem' }}>Fonte: DINARA · MGAP · Boletín Estadístico Pesquero. Sem API pública disponível.</div>
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>

        <div className={`profile-card${collapsedCards['vedas'] ? ' collapsed' : ''}`}>
          <div className="section-title">
            <span style={{ fontSize: 16 }}>📅</span> Calendário de Vedas
            <button className="collapse-btn" onClick={() => toggleCardCollapse('vedas')} type="button">
              {collapsedCards['vedas'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
          {!collapsedCards['vedas'] && (() => {
            const hoje = new Date();
            const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            const itens = getVedasAtivas(hoje);
            return (
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  Baseado em CARU Res. 59/12 e DINARA Dec. 149/997. Verifique sempre a legislação vigente.
                </p>
                {itens.map(({ veda, sp, status }) => {
                  const isActive = status?.active;
                  const isAbsoluta = veda.type === 'absoluta';
                  const bg = isAbsoluta ? 'rgba(239,68,68,0.08)' : isActive ? 'rgba(249,115,22,0.07)' : 'var(--bg-card)';
                  const border = isAbsoluta ? '#ef4444' : isActive ? '#f97316' : 'var(--border-faint2)';
                  const badge = isAbsoluta ? { text: 'VEDA ABSOLUTA', color: '#ef4444' }
                    : isActive ? { text: `EM VEDA · ${status.daysLeft}d restantes`, color: '#f97316' }
                    : status?.daysUntil != null ? { text: `COMEÇA EM ${status.daysUntil}d`, color: '#eab308' }
                    : { text: 'FORA DA VEDA', color: '#22c55e' };
                  return (
                    <div key={veda.speciesId} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: sp?.color || '#888', display: 'inline-block' }} />
                          {sp ? spName(sp, lang) : ''}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badge.color, background: badge.color + '22', padding: '2px 7px', borderRadius: 10 }}>
                          {badge.text}
                        </span>
                      </div>
                      {veda.period && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                          🗓 {meses[veda.period.start[0]-1]} {veda.period.start[1]} → {meses[veda.period.end[0]-1]} {veda.period.end[1]}
                        </div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{veda.authority}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{veda.note}</div>
                    </div>
                  );
                })}
                <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6, fontStyle: 'italic' }}>
                  🌿 A pesca sustentável preserva os estoques para as gerações futuras.
                </p>
              </div>
            );
          })()}
        </div>

        <div className={`profile-card${collapsedCards['snap'] ? ' collapsed' : ''}`}>
          <div className="section-title">
            <span style={{ fontSize: 16 }}>🛡️</span> Áreas Protegidas
            <button
              type="button"
              onClick={() => setShowSnapAreas(v => !v)}
              style={{ marginLeft: 'auto', marginRight: 6, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, border: `1px solid ${showSnapAreas ? '#16a34a' : 'var(--border-faint2)'}`, background: showSnapAreas ? 'rgba(20,83,45,0.15)' : 'var(--bg-card2)', color: showSnapAreas ? '#22c55e' : 'var(--text-muted)', cursor: 'pointer' }}
            >
              {showSnapAreas ? '● visível' : '○ oculto'}
            </button>
            <button className="collapse-btn" onClick={() => toggleCardCollapse('snap')} type="button">
              {collapsedCards['snap'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
          {!collapsedCards['snap'] && (() => {
            // Ciente de região: UY = SNAP (inline); demais = áreas carregadas (RS = UCs ICMBio).
            const isUY = selectedCountry === 'UY';
            const cardAreas = isUY ? SNAP_AREAS : protectedAreas;
            const snapCfg = {
              parque_nacional:   { color: '#16a34a', icon: '🏞️', label: 'Parque Nacional' },
              paisaje_protegido: { color: '#0ea5e9', icon: '🌿', label: 'Paisagem Protegida' },
              monumento_natural: { color: '#a855f7', icon: '🪨', label: 'Monumento Natural' },
              area_manejo:       { color: '#f59e0b', icon: '🦜', label: 'Área de Manejo' },
              reserva_recursos:  { color: '#06b6d4', icon: '💧', label: 'Reserva de Recursos' },
            };
            const ucCfg = {
              PARQUE: { color: '#16a34a', icon: '🏞️', label: 'Parque' },
              REBIO: { color: '#15803d', icon: '🌳', label: 'Reserva Biológica' },
              ESEC:  { color: '#0d9488', icon: '🔬', label: 'Estação Ecológica' },
              REVIS: { color: '#a855f7', icon: '🦌', label: 'Refúgio de Vida Silvestre' },
              MONA:  { color: '#9333ea', icon: '🪨', label: 'Monumento Natural' },
              APA:   { color: '#0ea5e9', icon: '🌿', label: 'Área de Proteção Ambiental' },
              ARIE:  { color: '#22d3ee', icon: '🌱', label: 'Área de Relevante Interesse Ecológico' },
              FLORESTA: { color: '#ca8a04', icon: '🌲', label: 'Floresta' },
              RESEX: { color: '#f59e0b', icon: '🛶', label: 'Reserva Extrativista' },
              RDS:   { color: '#eab308', icon: '🌾', label: 'Reserva de Desenvolvimento Sustentável' },
              RPPN:  { color: '#84cc16', icon: '🌿', label: 'Reserva Particular (RPPN)' },
            };
            const cfgMap = isUY ? snapCfg : ucCfg;
            const attribution = isUY ? 'Lei 17.234/2000 · SNAP/MVOTMA' : 'ICMBio/CNUC · SNUC (Lei 9.985/2000)';
            const subOf = (a) => isUY ? (a.department || '') : (a.group === 'PI' ? 'Proteção Integral' : a.group === 'US' ? 'Uso Sustentável' : (a.esfera || ''));
            if (!cardAreas.length) {
              return <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Sem áreas de preservação cadastradas para esta região ainda.</p>;
            }
            const groups = Object.entries(
              cardAreas.reduce((acc, a) => {
                const cfg = cfgMap[a.category] || { color: '#94a3b8', icon: '🛡️', label: a.category || 'Outros' };
                if (!acc[a.category]) acc[a.category] = { cfg, areas: [] };
                acc[a.category].areas.push(a);
                return acc;
              }, {})
            );
            return (
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 8 }}>
                  {cardAreas.length} áreas · {attribution}
                </p>
                {groups.map(([cat, { cfg, areas }]) => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg.color, marginBottom: 4 }}>
                      {cfg.icon} {cfg.label} ({areas.length})
                    </div>
                    {areas.map(a => (
                      <div key={a.id} style={{ fontSize: '0.75rem', padding: '4px 8px', borderLeft: `2px solid ${cfg.color}`, marginBottom: 3, color: 'var(--text-primary)' }}>
                        <strong>{a.name}</strong>
                        {subOf(a) && <span style={{ color: 'var(--text-dim)', marginLeft: 5 }}>· {subOf(a)}</span>}
                      </div>
                    ))}
                  </div>
                ))}
                <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 4, fontStyle: 'italic' }}>
                  🎣 Clique nas áreas/marcadores no mapa para ver as regras de pesca.
                </p>
              </div>
            );
          })()}
        </div>

        <Suspense fallback={null}>
        <div className={`profile-card user-card${collapsedCards['user'] ? ' collapsed' : ''}`}>
          <div className="section-title"><User size={18} /> Perfil do pescador <button className="collapse-btn" onClick={() => toggleCardCollapse('user')} type="button">{collapsedCards['user'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['user'] && <UserProfile occurrences={occurrences} speciesList={species} userName={authSession?.user?.email?.split('@')[0] || null} />}
        </div>

        <div className={`profile-card challenges-card${collapsedCards['challenges'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Trophy size={18} /> Desafios semanais <button className="collapse-btn" onClick={() => toggleCardCollapse('challenges')} type="button">{collapsedCards['challenges'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['challenges'] && <Challenges occurrences={occurrences} currentDeviceId={getDeviceId()} />}
        </div>

        <div className={`profile-card${collapsedCards['climate'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Sun size={18} /> Ambiente atual {selectedClimate.live && <span className="live-badge">ao vivo</span>} <button className="collapse-btn" onClick={() => toggleCardCollapse('climate')} type="button">{collapsedCards['climate'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['climate'] && <><h2>{selectedClimate.name}</h2>
          <p><strong>Nascer/Pôr do sol:</strong> {selectedClimate.sunrise} / {selectedClimate.sunset}</p>
          <p><strong>Ar/água:</strong> {selectedClimate.airTemperature} °C / {selectedClimate.waterTemperature} °C</p>
          <p><strong>Radiação solar:</strong> {selectedClimate.solarRadiation}%</p>
          <p><strong>Vento:</strong> {selectedClimate.wind} km/h · pressão {selectedClimate.pressureTrend}</p>
          {selectedClimate.humidity != null && <p><strong>Umidade:</strong> {selectedClimate.humidity}%</p>}
          {selectedClimate.pressure != null && <p><strong>Pressão:</strong> {selectedClimate.pressure} hPa</p>}
          {dischargeData && (
            <>
              <p><strong>Vazão do rio:</strong> {dischargeData.current} {dischargeData.unit} · {dischargeData.trend}</p>
              <p><strong>Média 30 dias:</strong> {dischargeData.avg30} {dischargeData.unit}</p>
            </>
          )}
          {iotSensorData && (
            <p><strong>Água (IoT):</strong> {iotSensorData.avgTemp}°C · nível {iotSensorData.avgLevel}m · {iotSensorData.sensorCount} sensor{iotSensorData.sensorCount !== 1 ? 'es' : ''} ({iotSensorData.source === 'live' ? 'ao vivo' : 'demo'})</p>
          )}</>}
        </div>

        <div className={`profile-card iot-card${collapsedCards['iot'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Waves size={18} /> Sensores IoT <button className="collapse-btn" onClick={() => toggleCardCollapse('iot')} type="button">{collapsedCards['iot'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['iot'] && <IoTSensors onSensorData={setIotSensorData} />}
        </div>

        <div className={`profile-card${collapsedCards['filters'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Bell size={18} /> Filtros e compartilhamento <button className="collapse-btn" onClick={() => toggleCardCollapse('filters')} type="button">{collapsedCards['filters'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['filters'] && <><TemporalFilter filter={temporalFilter} onFilterChange={handleTemporalFilterChange} occurrences={occurrences} isPremium={isPremium} />
          <SocialShare selectedSpecies={selectedSpecies} bestSegment={bestSegment} probRange={probRange} occurrences={occurrences} speciesList={species} lastOccurrence={occurrences.length > 0 ? occurrences[occurrences.length - 1] : null} /></>}
        </div>

        <div className={`profile-card${collapsedCards['admin'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Settings size={18} /> Admin IoT <button className="collapse-btn" onClick={() => toggleCardCollapse('admin')} type="button">{collapsedCards['admin'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['admin'] && <IoTAdmin authSession={authSession} />}
        </div>

        <div className={`profile-card${collapsedCards['correlation'] ? ' collapsed' : ''}`}>
          <div className="section-title"><BarChart3 size={18} /> Correlação IoT × Capturas <button className="collapse-btn" onClick={() => toggleCardCollapse('correlation')} type="button">{collapsedCards['correlation'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['correlation'] && <CorrelationAnalysis occurrences={occurrences} speciesList={species} sensorData={iotSensorData} climateData={selectedClimate} />}
        </div>

        <div className={`profile-card${collapsedCards['besttime'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Clock size={18} /> Melhor horário — {selectedSpecies.name} <button className="collapse-btn" onClick={() => toggleCardCollapse('besttime')} type="button">{collapsedCards['besttime'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['besttime'] && <BestTimePrediction occurrences={occurrences} selectedSpecies={selectedSpecies} climateData={selectedClimate} />}
        </div>

        <div className={`profile-card${collapsedCards['lunar'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Moon size={18} /> Calendário lunar e marés <button className="collapse-btn" onClick={() => toggleCardCollapse('lunar')} type="button">{collapsedCards['lunar'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['lunar'] && <LunarTides />}
        </div>

        <div className={`profile-card chat-card${collapsedCards['chat'] ? ' collapsed' : ''}`}>
          <div className="section-title"><MessageCircle size={18} /> Chat — <span className="cell-link" onClick={() => bestSegment && navigateToCell(bestSegment)}>{bestSegment?.name ?? 'Rio Santa Lucía'}</span> <button className="collapse-btn" onClick={() => toggleCardCollapse('chat')} type="button">{collapsedCards['chat'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['chat'] && <><RiverChat segmentName={bestSegment?.name ?? 'Rio Santa Lucía'} authSession={authSession} />
          <ChatBadges messages={[]} deviceId={getDeviceId()} /></>}
        </div>

        <div className={`profile-card guide-card${collapsedCards['guide'] ? ' collapsed' : ''}`}>
          <div className="section-title"><MapPinned size={18} /> Guia de pesca — {selectedSpecies.name} <button className="collapse-btn" onClick={() => toggleCardCollapse('guide')} type="button">{collapsedCards['guide'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['guide'] && <FishingGuide scoredSegments={scoredSegments} selectedSpecies={selectedSpecies} climateData={selectedClimate} dischargeData={dischargeData} />}
        </div>

        <div className={`profile-card gear-card${collapsedCards['gear'] ? ' collapsed' : ''}`} style={{ gridColumn: '1 / -1' }}>
          <div className="section-title">
            <Package size={18} /> Equipamentos recomendados
            <button className="collapse-btn" onClick={() => toggleCardCollapse('gear')} type="button">{collapsedCards['gear'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
            {authSession && <button onClick={() => setStoreAdminOpen(true)} title="Painel da minha loja" style={{marginLeft:'auto',padding:'3px 10px',background:'transparent',border:'1px solid #334155',borderRadius:5,color:'#d97706',cursor:'pointer',fontSize:'0.72rem',fontWeight:600}}>🏪 Minha loja</button>}
          </div>
          {!collapsedCards['gear'] && <GearRecommendation selectedSpeciesList={selectedSpeciesList} focusedCell={focusedCell} occurrences={occurrences} userLocation={userLocation} />}
        </div>

        <div className={`profile-card gear-card${collapsedCards['buoy'] ? ' collapsed' : ''}`} style={{ gridColumn: '1 / -1' }}>
          <div className="section-title">
            <Anchor size={18} /> {{ pt: 'Calculadora de Bóia e Chumbada', es: 'Calculadora de Boya y Plomada', en: 'Bobber & Sinker Calculator' }[lang] || 'Calculadora de Bóia e Chumbada'}
            <button className="collapse-btn" onClick={() => toggleCardCollapse('buoy')} type="button">{collapsedCards['buoy'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
          </div>
          {!collapsedCards['buoy'] && <BuoyCalculator />}
        </div>

        <div className={`profile-card gear-card${collapsedCards['knot'] ? ' collapsed' : ''}`} style={{ gridColumn: '1 / -1' }}>
          <div className="section-title">
            <Link size={18} /> {{ pt: 'Calculadora de Nó e Linha', es: 'Calculadora de Nudo y Línea', en: 'Knot & Line Calculator' }[lang] || 'Calculadora de Nó e Linha'}
            <button className="collapse-btn" onClick={() => toggleCardCollapse('knot')} type="button">{collapsedCards['knot'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
          </div>
          {!collapsedCards['knot'] && <KnotCalculator />}
        </div>

        <div className={`profile-card stats-card${collapsedCards['stats'] ? ' collapsed' : ''}`}>
          <div className="section-title"><BarChart3 size={18} /> Dashboard estatístico <button className="collapse-btn" onClick={() => toggleCardCollapse('stats')} type="button">{collapsedCards['stats'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['stats'] && <StatsDashboard occurrences={occurrences} speciesList={species} />}
        </div>

        <div className={`profile-card discharge-card${collapsedCards['discharge'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Droplets size={18} /> Vazão do rio (GloFAS) <button className="collapse-btn" onClick={() => toggleCardCollapse('discharge')} type="button">{collapsedCards['discharge'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['discharge'] && (dischargeData ? (
            <>
              <DischargeChart dischargeData={dischargeData} />
              <p className="discharge-summary">
                Atual: <strong>{dischargeData.current} {dischargeData.unit}</strong> · Tendência: <strong>{dischargeData.trend}</strong> · Média 30d: <strong>{dischargeData.avg30} {dischargeData.unit}</strong>
              </p>
              {dischargeData.alerts && dischargeData.alerts.length > 0 && (
                <div className="discharge-alerts">
                  {dischargeData.alerts.map((a, i) => (
                    <div key={i} className={`discharge-alert ${a.type}`}>
                      <AlertTriangle size={13} />
                      <span><strong>{a.label}</strong> em {a.day.slice(5)} — {Math.round(a.value)} {dischargeData.unit} ({Math.round(a.ratio * 100)}% da média)</span>
                    </div>
                  ))}
                </div>
              )}
              {dischargeData.alerts && dischargeData.alerts.length === 0 && (
                <p className="discharge-ok">✓ Sem alertas de cheia ou seca nos próximos 7 dias</p>
              )}
            </>
          ) : (
            <p>Carregando dados hidrológicos...</p>
          ))}
        </div>

        <div className={`profile-card model-card${collapsedCards['model'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Zap size={18} /> Modelo ativo <button className="collapse-btn" onClick={() => toggleCardCollapse('model')} type="button">{collapsedCards['model'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['model'] && (activeModelInfo ? (
            <>
              <h2>{activeModelInfo.hasBayesian ? 'Bayesiano espacial + ensemble' : 'Ensemble (logístico + forest)'}</h2>
              <p><strong>Modo:</strong> {activeModelInfo.hasBayesian ? 'bayesian-ensemble' : 'ensemble'}</p>
              <p><strong>Treinado com:</strong> {activeModelInfo.positiveCount} células positivas de {activeModelInfo.totalCells} ({activeModelInfo.coverage}% cobertura)</p>
              {activeModelInfo.cvAccuracy != null && <p><strong>Validação cruzada:</strong> {activeModelInfo.cvAccuracy}% acurácia</p>}
              <p><strong>Random forest:</strong> {activeModelInfo.numTrees} árvores</p>
              {activeModelInfo.hasBayesian && (
                <>
                  <p><strong>Prior espacial:</strong> kernel gaussiano adaptativo (k-NN, 1.5–8 km)</p>
                  <p><strong>Likelihood:</strong> Naive Bayes gaussiano × 7 features</p>
                  <p><strong>Posterior:</strong> prior × likelihood / evidência</p>
                </>
              )}
              <p><strong>Top features (logístico):</strong></p>
              {activeModelInfo.topLogisticFeatures.map((f) => (
                <p key={f.feature}>&nbsp;&nbsp;{f.feature}: peso {f.weight > 0 ? '+' : ''}{f.weight.toFixed(3)}</p>
              ))}
              <p><strong>Top features (forest):</strong></p>
              {activeModelInfo.topForestFeatures.map((f) => (
                <p key={f.feature}>&nbsp;&nbsp;{f.feature}: {f.count} árvores</p>
              ))}
            </>
          ) : (
            <>
              <h2>Somente heurístico</h2>
              <p>Registre ocorrências em pelo menos 3 células distintas para ativar o modelo bayesiano espacial.</p>
            </>
          ))}
        </div>

        <div className={`profile-card trend-card${collapsedCards['trend'] ? ' collapsed' : ''}`}>
          <div className="section-title"><BarChart3 size={18} /> Tendência de ocorrências <button className="collapse-btn" onClick={() => toggleCardCollapse('trend')} type="button">{collapsedCards['trend'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['trend'] && <TrendChart occurrences={occurrences} speciesList={species} selectedSpeciesId={selectedSpeciesId} />}
        </div>

        <div className={`profile-card hourly-card${collapsedCards['hourly'] ? ' collapsed' : ''}`}>
          <div className="section-title"><Clock size={18} /> Melhores horários — {spName(selectedSpecies, lang)} <button className="collapse-btn" onClick={() => toggleCardCollapse('hourly')} type="button">{collapsedCards['hourly'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['hourly'] && <HourlyRanking occurrences={occurrences} speciesList={species} selectedSpeciesId={selectedSpeciesId} />}
        </div>

        <div className={`profile-card comparison-card${collapsedCards['comparison'] ? ' collapsed' : ''}`}>
          <div className="section-title"><GitCompare size={18} /> Comparação de espécies — <span className="cell-link" onClick={() => bestSegment && navigateToCell(bestSegment)}>{bestSegment?.name ?? 'Rio Santa Lucía'}</span> <button className="collapse-btn" onClick={() => toggleCardCollapse('comparison')} type="button">{collapsedCards['comparison'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['comparison'] && <><div className="comparison-list">
            {speciesComparison.map((sp) => (
              <div key={sp.id} className={`comparison-row${sp.id === selectedSpeciesId ? ' selected' : ''}`}>
                <span className="comparison-name" style={{ color: sp.color }}>{sp.name}</span>

                <div className="comparison-bar-track">
                  <div className="comparison-bar-fill" style={{ width: `${sp.probability}%`, backgroundColor: sp.color }} />
                </div>
                <span className="comparison-score">{sp.probability}%</span>
              </div>
            ))}
          </div>
          <p className="comparison-hint">Probabilidades calculadas para a célula de maior score na condição atual.</p></>}
        </div>

        <div className={`ranking-card${collapsedCards['ranking'] ? ' collapsed' : ''}`} style={{ gridColumn: '1 / -1' }}>
          <div className="section-title"><Waves size={18} /> Ranking das células <button className="collapse-btn" onClick={() => toggleCardCollapse('ranking')} type="button">{collapsedCards['ranking'] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button></div>
          {!collapsedCards['ranking'] && <div className="ranking-list">
            {scoredSegments.map((cell) => (
              <div className="rank-row" key={cell.id}>
                <div>
                  <strong className="cell-link" onClick={() => navigateToCell(cell)} title="Ver no mapa">{cell.name}</strong>
                  <span>{cell.topography}{cell.calibration > 0 ? ` · +${cell.calibration}% calibrado` : ''}</span>
                </div>
                <b>{cell.probability}%</b>
              </div>
            ))}
          </div>}
        </div>
        </Suspense>
      </section>


      {/* Floating planner button */}
      <PlannerFab onClick={() => {
          if (!authSession) { setAuthModalOpen(true); return; }
          setPlannerOpen(true);
        }} />
      
      {/* Floating fishing session button */}
      <FishingSessionFab 
        onClick={() => {
          if (!authSession) { setAuthModalOpen(true); return; }
          if (activeSession) {
            setSessionStep('active');
          } else {
            setSessionStep('select-location');
          }
          setSessionMinimized(false);
          setSessionModalOpen(true);
        }} 
        hasActiveSession={!!activeSession}
        isMinimized={sessionMinimized}
        catchCount={sessionCatches.length}
      />
      
      {/* Fishing Session Modal */}
      <FishingSessionModal
        isOpen={sessionModalOpen && !sessionMinimized}
        onClose={() => setSessionModalOpen(false)}
        onMinimize={() => setSessionMinimized(true)}
        step={sessionStep}
        setStep={setSessionStep}
        activeSession={activeSession}
        setActiveSession={setActiveSession}
        catches={sessionCatches}
        setCatches={setSessionCatches}
        species={species}
        watercourseList={watercourseList}
        userLocation={userLocation}
      />

      {/* FishID Modal — identificação de espécie por foto (standalone) */}
      {fishIdOpen && (
        <FishIDModal
          open={fishIdOpen}
          onClose={() => setFishIdOpen(false)}
          onConfirm={(speciesId, _imgUrl, _result) => {
            const match = species.find(s =>
              s.id === speciesId ||
              s.name?.toLowerCase().replace(/\s+/g, '_') === speciesId ||
              s.name?.toLowerCase().includes(speciesId.replace(/_/g, ' '))
            );
            if (match) {
              setSelectedSpecies(match);
              setFishIdPendingSpecies(match);
            }
            setFishIdOpen(false);
          }}
          location={userLocation}
          supabaseUrl={import.meta.env.VITE_SUPABASE_URL || ''}
          supabaseKey={import.meta.env.VITE_SUPABASE_ANON_KEY || ''}
          lang={lang}
        />
      )}

      {/* Moderation Modal */}
      {moderationModalOpen && (
        <ModerationModal
          isOpen={moderationModalOpen}
          onClose={() => setModerationModalOpen(false)}
          qualityReports={qualityReports}
          onApprove={handleApproveQualityReport}
          onReject={handleRejectQualityReport}
          onRefresh={() => {
            supabase
              .from('water_quality_reports')
              .select(`*, watercourse:watercourse_id (id, name, type)`)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .then(({ data }) => setQualityReports(data || []));
          }}
        />
      )}

      <Suspense fallback={null}>
      <FishingPlanner
        isOpen={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        speciesList={species}
        scoredSegments={scoredSegments}
        watercourseList={watercourseList}
        climateScenarios={climateScenarios}
        authSession={authSession}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenDashboard={() => setDashboardOpen(true)}
      />
      </Suspense>

      <Suspense fallback={null}>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => setAuthModalOpen(false)}
      />
      </Suspense>

      <Suspense fallback={null}>
      <UserDashboard
        isOpen={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        authSession={authSession}
        occurrences={occurrences}
        speciesList={species}
        onShowReportSpots={spots => setReportSpots(spots)}
      />

      <EnvironmentalDashboard
        isOpen={envDashboardOpen}
        onClose={() => setEnvDashboardOpen(false)}
        sensors={iotSensors}
        dischargeData={dischargeData}
        occurrences={occurrences}
        watercourseList={watercourseList}
      />

      <PaywallModal
        isOpen={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={paywallFeature}
      />
      </Suspense>

      {/* Modal de registro de posto de pesca */}
      {spotModal && spotModal.lat && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setSpotModal(null); }}
        >
          <div style={{ background:'#0f172a', border:'1px solid #334155', borderRadius:12, padding:24, width:'90%', maxWidth:400, color:'#f1f5f9' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <strong style={{ fontSize:'1rem', color:'#fbbf24' }}>🎣 Registrar Posto de Pesca</strong>
              <button onClick={() => setSpotModal(null)} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:18 }}>×</button>
            </div>
            <div style={{ fontSize:'0.72rem', color:'#64748b', marginBottom:12 }}>
              📍 {spotModal.lat.toFixed(5)}, {spotModal.lng.toFixed(5)}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ fontSize:'0.8rem' }}>
                Nome do posto *
                <input
                  value={spotForm.name}
                  onChange={e => setSpotForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Boca do Arroyo Carrasco"
                  style={{ display:'block', width:'100%', marginTop:4, padding:'7px 10px', borderRadius:6, background:'#1e293b', border:'1px solid #334155', color:'#f1f5f9', fontSize:'0.85rem', boxSizing:'border-box' }}
                />
              </label>
              <label style={{ fontSize:'0.8rem' }}>
                Tipo de acesso
                <select
                  value={spotForm.access_type}
                  onChange={e => setSpotForm(p => ({ ...p, access_type: e.target.value }))}
                  style={{ display:'block', width:'100%', marginTop:4, padding:'7px 10px', borderRadius:6, background:'#1e293b', border:'1px solid #334155', color:'#f1f5f9', fontSize:'0.85rem' }}
                >
                  <option value="bank">🎣 Margem</option>
                  <option value="boat">⛵ Barco</option>
                  <option value="wading">🥾 Vadeando</option>
                  <option value="pier">🌉 Pier / Ponte</option>
                </select>
              </label>
              <label style={{ fontSize:'0.8rem' }}>
                Descrição (opcional)
                <textarea
                  value={spotForm.description}
                  onChange={e => setSpotForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Dicas de acesso, espécies frequentes, época..."
                  rows={3}
                  style={{ display:'block', width:'100%', marginTop:4, padding:'7px 10px', borderRadius:6, background:'#1e293b', border:'1px solid #334155', color:'#f1f5f9', fontSize:'0.85rem', resize:'vertical', boxSizing:'border-box' }}
                />
              </label>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:16 }}>
              <button onClick={() => setSpotModal(null)}
                style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1px solid #334155', background:'#1e293b', color:'#94a3b8', cursor:'pointer', fontSize:'0.85rem' }}
              >Cancelar</button>
              <button
                disabled={spotSaving || !spotForm.name.trim()}
                onClick={async () => {
                  if (!spotForm.name.trim()) return;
                  setSpotSaving(true);
                  try {
                    await addFishingSpot({
                      name: spotForm.name.trim(),
                      description: spotForm.description.trim(),
                      access_type: spotForm.access_type,
                      lat: spotModal.lat,
                      lng: spotModal.lng,
                      species_ids: spotForm.species_ids,
                      species_names: spotForm.species_names,
                    });
                    const updated = await getFishingSpots();
                    setFishingSpots(updated);
                    setSpotModal(null);
                    setSpotForm({ name:'', description:'', access_type:'bank', species_ids:[], species_names:[] });
                  } catch(err) {
                    toast.error('Erro ao salvar: ' + err.message);
                  } finally {
                    setSpotSaving(false);
                  }
                }}
                style={{ flex:2, padding:'8px 0', borderRadius:8, border:'none', background: spotSaving || !spotForm.name.trim() ? '#334155' : '#d97706', color:'#fff', cursor: spotSaving || !spotForm.name.trim() ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:'0.85rem' }}
              >{spotSaving ? 'Salvando...' : 'Registrar posto'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Relatório de Impacto Ambiental */}
      {envReportTarget && (
        <EnvImpactReportModal
          watercourse={envReportTarget}
          occurrences={occurrences}
          dischargeData={dischargeData}
          iotSensors={iotSensors}
          onClose={() => setEnvReportTarget(null)}
        />
      )}

      {/* Dashboard de Lojista */}
      {storeAdminOpen && (
        <StoreAdmin
          isOpen={storeAdminOpen}
          onClose={() => setStoreAdminOpen(false)}
          authSession={authSession}
          userLocation={userLocation}
        />
      )}

      {/* Modal de Reporte de Qualidade da Água */}
      {reportModalOpen && reportTarget && (
        <WaterQualityReportModal
          isOpen={reportModalOpen}
          onClose={() => { setReportModalOpen(false); setReportTarget(null); }}
          watercourse={reportTarget}
          onSubmit={async (reportData) => {
            try {
              await reportWaterQuality({
                watercourseId: reportTarget.id,
                watercourseName: reportTarget.name,
                reportType: reportData.reportType,
                observedQuality: reportData.observedQuality,
                description: reportData.description,
                indicators: reportData.indicators
              });
              setReportModalOpen(false);
              setReportTarget(null);
              toast.success('Reporte enviado para moderação. Obrigado!');
            } catch (err) {
              toast.error('Erro ao enviar reporte: ' + err.message);
            }
          }}
        />
      )}

      {/* ── Bottom Navigation Bar (mobile only) ────────────────── */}
      <nav className="bottom-nav" role="navigation" aria-label="Navegação principal">
        <button
          type="button"
          className={`bottom-nav-btn${activePage === 'app' && activeBottomTab === 'map' ? ' active' : ''}`}
          onClick={() => { setActivePage('app'); setActiveBottomTab('map'); setSidebarOpen(false); }}
          aria-label={t('navMap')}
        >
          <MapPin size={22} />
          <span>{t('navMap')}</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn${activePage === 'app' && activeBottomTab === 'catches' ? ' active' : ''}`}
          onClick={() => { setActivePage('app'); setActiveBottomTab('catches'); setSidebarOpen(false); }}
          aria-label={t('navCatches')}
        >
          <Fish size={22} />
          <span>{t('navCatches')}</span>
        </button>
        {/* FAB central — Iniciar Pescaria */}
        <button
          type="button"
          className="bottom-nav-fab"
          onClick={() => {
            if (!authSession) { setAuthModalOpen(true); return; }
            if (activeSession) { setSessionStep('active'); } else { setSessionStep('select-location'); }
            setSessionMinimized(false);
            setSessionModalOpen(true);
          }}
          aria-label={activeSession ? t('navFishingActive') : t('navStartFishing')}
        >
          {activeSession ? <Fish size={26} /> : <Plus size={26} />}
        </button>
        <button
          type="button"
          className={`bottom-nav-btn${activePage === 'social' ? ' active' : ''}`}
          onClick={() => { setActivePage('social'); setSidebarOpen(false); }}
          aria-label={t('navFeed')}
        >
          <Users size={22} />
          <span>{t('navFeed')}</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn${activePage === 'app' && activeBottomTab === 'chat' ? ' active' : ''}`}
          onClick={() => { setActivePage('app'); setActiveBottomTab('chat'); setSidebarOpen(false); }}
          aria-label={t('navChat')}
        >
          <MessageCircle size={22} />
          <span>{t('navChat')}</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-btn${activePage === 'app' && sidebarOpen ? ' active' : ''}`}
          onClick={() => { setActivePage('app'); setSidebarOpen(v => !v); }}
          aria-label={t('navMenu')}
        >
          <Settings size={22} />
          <span>{t('navMenu')}</span>
        </button>
      </nav>
    </main>

    {/* ── Social Feed Page ── */}
    {activePage === 'social' && (
      <div className="sf-page-container">
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{t('loading')}</span></div>}>
          <SocialFeed authSession={authSession} speciesList={species || []} onRequestLogin={() => setAuthModalOpen(true)} />
        </Suspense>
      </div>
    )}

    {/* ── Pescademia Page ── */}
    {activePage === 'pescademia' && (
      <div className="sf-page-container">
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{t('loading')}</span></div>}>
          <Pescademia authSession={authSession} showPaywall={showPaywall} />
        </Suspense>
      </div>
    )}
    </>
  );
}

// Componente Modal de Reporte de Qualidade da Água
function WaterQualityReportModal({ isOpen, onClose, watercourse, onSubmit }) {
  const [reportType, setReportType] = useState('general_condition');
  const [observedQuality, setObservedQuality] = useState(50);
  const [description, setDescription] = useState('');
  const [indicators, setIndicators] = useState({
    hasTrash: false,
    hasFoam: false,
    hasBadSmell: false,
    hasDeadFish: false,
    color: 'normal'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !watercourse) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSubmit({
      reportType,
      observedQuality,
      description,
      indicators
    });
    setIsSubmitting(false);
  };

  return (
    <div className="planner-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="planner-modal" style={{ maxWidth: 480 }}>
        <div className="planner-header">
          <div className="planner-title">
            <Flag size={20} />
            <span>Reportar Qualidade da Água</span>
          </div>
          <button className="planner-close" onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <div className="planner-body">
          <div className="planner-section">
            <h3>{watercourse.name}</h3>
            <p className="planner-hint">
              Qualidade atual: <strong>{watercourse.currentQuality}%</strong>
              {watercourse.currentIsReal ? ' (dado oficial/validado)' : ' (estimativa automática)'}
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label>
                <span>Tipo de reporte</span>
                <select 
                  value={reportType} 
                  onChange={(e) => setReportType(e.target.value)}
                  style={{ width: '100%', padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'inherit' }}
                >
                  <option value="general_condition">Condição geral da água</option>
                  <option value="clean_to_polluted">Vi poluição em local limpo</option>
                  <option value="polluted_to_clean">Local poluído melhorou</option>
                </select>
              </label>

              <label>
                <span>Avaliação da qualidade (0-100%)</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={observedQuality}
                  onChange={(e) => setObservedQuality(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                  <span>Poluído (0%)</span>
                  <span style={{ color: observedQuality < 50 ? '#ef4444' : observedQuality < 65 ? '#f97316' : '#22c55e', fontWeight: 600 }}>
                    {observedQuality}%
                  </span>
                  <span>Limpo (100%)</span>
                </div>
              </label>

              <div>
                <span style={{ display: 'block', marginBottom: 8 }}>Indicadores observados</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIndicators(p => ({ ...p, hasTrash: !p.hasTrash }))}
                    className={`chip${indicators.hasTrash ? ' active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {indicators.hasTrash ? '✓ ' : ''}Lixo visível
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndicators(p => ({ ...p, hasFoam: !p.hasFoam }))}
                    className={`chip${indicators.hasFoam ? ' active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {indicators.hasFoam ? '✓ ' : ''}Espuma
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndicators(p => ({ ...p, hasBadSmell: !p.hasBadSmell }))}
                    className={`chip${indicators.hasBadSmell ? ' active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {indicators.hasBadSmell ? '✓ ' : ''}Mau cheiro
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndicators(p => ({ ...p, hasDeadFish: !p.hasDeadFish }))}
                    className={`chip${indicators.hasDeadFish ? ' active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    {indicators.hasDeadFish ? '✓ ' : ''}Peixes mortos
                  </button>
                </div>
              </div>

              <label>
                <span>Cor da água</span>
                <select
                  value={indicators.color}
                  onChange={(e) => setIndicators(p => ({ ...p, color: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'inherit' }}
                >
                  <option value="normal">Normal/transparente</option>
                  <option value="green">Verde (algas)</option>
                  <option value="brown">Marrom/turva</option>
                  <option value="black">Preta/escura</option>
                  <option value="oily">Oleosa/iridescente</option>
                </select>
              </label>

              <label>
                <span>Descrição detalhada</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o que observou: lixo, espuma, odor, cor, presença de indústrias próximas, etc."
                  rows={4}
                  required
                  style={{ width: '100%', padding: 8, borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'inherit', resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="planner-btn-back" onClick={onClose} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="planner-btn-next"
                  disabled={isSubmitting || !description.trim()}
                  style={{ flex: 2 }}
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar para moderação'}
                </button>
              </div>

              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                ⚠️ Este reporte será analisado pela moderação antes de ser publicado. Falsos reportes podem resultar em suspensão.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// Canvas renderer singleton — reutilizado por todas as polylines de bacia
// Muito mais performático que SVG para milhares de linhas
const _canvasRenderer = typeof window !== 'undefined' ? window.L?.canvas({ padding: 0.5, tolerance: 3 }) : null;

// Pool de canvas renderers POR BACIA (chave = regionId). Motivos:
//  1) Um único canvas compartilhado satura acima de ~40k linhas e não pinta nada;
//     separando por bacia (ex.: Uruguai ~38k), nenhum canvas isolado passa do limite.
//  2) Reusar por chave (em vez de criar um novo a cada montagem) evita que os
//     elementos <canvas> se acumulem no DOM a cada troca de país (vazamento), sem
//     precisar remover renderers no unmount (o que quebra o redesenho ao remontar).
const _basinRenderers = {};
function getBasinRenderer(key) {
  if (typeof window === 'undefined' || !window.L) return _canvasRenderer;
  if (!_basinRenderers[key]) _basinRenderers[key] = window.L.canvas({ padding: 0.5, tolerance: 8 });
  return _basinRenderers[key];
}

// Simplifica path de bacia mantendo 1 em cada N pontos, preservando início/fim
function _simplifyBasinPath(path, step) {
  if (step <= 1 || path.length <= 2) return path;
  const result = [path[0]];
  for (let i = step; i < path.length - 1; i += step) result.push(path[i]);
  result.push(path[path.length - 1]);
  return result;
}

function BasinLayer({ tributaries, color, regionId, lineWeight, hitWeight, waterQualityData, species, occurrences }) {
  const [hoveredId, setHoveredId] = useState(null);
  // Canvas próprio desta bacia, reutilizado entre montagens (pool por regionId em
  // getBasinRenderer): distribui a carga e evita acúmulo de <canvas> ao trocar de país.
  const renderer = getBasinRenderer(regionId || 'default');
  const { lang: _blLang } = useLang();
  const _blT = useT();

  const formatSize = (kg) => !kg ? 'desconhecido' : kg < 1 ? `${Math.round(kg*1000)}g` : `${kg}kg`;
  const getTypeIcon = (t) => ({ rio:'🌊', canada:'🌿', quebrada:'⛰️', canal:'🏗️' }[t] || '〰️');
  const getTypeLabel = (t) => ({ rio:'Rio', canada:'Cañada', quebrada:'Quebrada', canal:'Canal' }[t] || 'Arroio'); // nome fixo do tipo de curso (próprio nome, não label UI)

  return <>
    {tributaries.map(t => {
      const wcType = classifyWatercourse(t.name || '');
      const allowedIds = SPECIES_BY_WATERCOURSE[wcType] || [];
      const speciesList = allowedIds.map(id => species.find(s => s.id === id)).filter(Boolean)
        .sort((a, b) => (b.maxSizeKg || 0) - (a.maxSizeKg || 0));
      const hasBigFish = speciesList.some(s => BIG_FISH_SPECIES.has(s.id));
      const qualityData = waterQualityData?.[t.id];
      const qualityScore = qualityData?.quality_score || estimateWaterQualityHeuristic(t.name, wcType, 0, 0);
      const courseOccurrences = (occurrences || []).filter(o => o.tributaryId === t.id || o.tributaryName === t.name).length;
      const isHovered = hoveredId === t.id;
      const w = t.waterway === 'river' ? lineWeight : lineWeight * 0.7;

      return t.paths.map((path, pi) => (
        <React.Fragment key={`bc-${t.id}-${pi}`}>
          {isHovered && (
            <Polyline positions={path}
              pathOptions={{ color, weight: w * 4, opacity: 0.25, lineCap: 'round', lineJoin: 'round' }}
              renderer={renderer}
            />
          )}
          <Polyline positions={path}
            pathOptions={{ color: isHovered ? '#fff' : color, weight: isHovered ? w * 1.5 : w,
              opacity: isHovered ? 1 : 0.7, lineCap: 'round', lineJoin: 'round' }}
            renderer={renderer}
            eventHandlers={{ mouseover: () => setHoveredId(t.id), mouseout: () => setHoveredId(null) }}
          >
            {pi === 0 && isHovered && (
              <Popup>
                <div style={{ minWidth: 210, maxWidth: 270, background: '#0f172a', padding: 12, borderRadius: 8, color: '#e5f6ff' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:'1.2rem' }}>{getTypeIcon(wcType)}</span>
                    <div>
                      <strong style={{ fontSize:'0.9rem', color:'#e5f6ff', display:'block' }}>{t.name}</strong>
                      <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{getTypeLabel(wcType)}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, padding:'5px 8px',
                    background: qualityScore < 50 ? 'rgba(239,68,68,0.15)' : qualityScore < 65 ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)',
                    borderRadius:6 }}>
                    <Droplets size={13} color={qualityScore < 50 ? '#ef4444' : qualityScore < 65 ? '#f97316' : '#22c55e'} />
                    <span style={{ fontSize:'0.78rem', color: qualityScore < 50 ? '#ef4444' : qualityScore < 65 ? '#f97316' : '#22c55e' }}>
                      {_blT('popupQuality')}: <strong>{qualityScore}%</strong>{!qualityData && ` (${_blT('popupEst')})`}
                    </span>
                  </div>
                  {speciesList.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:'0.7rem', color:'#64748b', marginBottom:4, textTransform:'uppercase' }}>{_blT('popupFish')} ({speciesList.length})</div>
                      {speciesList.slice(0,4).map(s => (
                        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 6px', fontSize:'0.78rem' }}>
                          <span style={{ width:7, height:7, borderRadius:'50%', background: s.color || color, flexShrink:0 }} />
                          <span style={{ flex:1, color:'#e5f6ff' }}>{spName(s, _blLang)}</span>
                          <span style={{ color:'#94a3b8' }}>{formatSize(s.maxSizeKg)}</span>
                          {BIG_FISH_SPECIES.has(s.id) && <span>🐟</span>}
                        </div>
                      ))}
                      {speciesList.length > 4 && <div style={{ fontSize:'0.72rem', color:'#64748b', padding:'2px 6px' }}>+{speciesList.length-4} {_blT('popupMoreSpecies')}</div>}
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, padding:7, background:'rgba(255,255,255,0.04)', borderRadius:5 }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'1rem', color:'#22c55e' }}>{courseOccurrences}</div>
                      <div style={{ fontSize:'0.68rem', color:'#64748b' }}>{_blT('navCatches')}</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'1rem' }}>{hasBigFish ? '🐟' : '—'}</div>
                      <div style={{ fontSize:'0.68rem', color:'#64748b' }}>{hasBigFish ? _blT('popupBigFish') : _blT('popupNoRecord')}</div>
                    </div>
                  </div>
                  <div style={{ marginTop:8, padding:'6px 8px', background:'rgba(26,111,212,0.1)', borderRadius:5, fontSize:'0.72rem', color:'#7ab8f5', textAlign:'center' }}>
                    💡 {_blT('popupSelectHeatmap')}
                  </div>
                </div>
              </Popup>
            )}
          </Polyline>
        </React.Fragment>
      ));
    })}
  </>;
}

// Componente para mostrar todos os cursos d'água quando nenhum está selecionado
function AllWatercourses({ tributaryLines, waterQualityData, species, occurrences, selectedWatercourseIds, santaLuciaGeometry, extraRivers = [], extraRiverGeometries = {}, activeBasins = new Set(), selectedCountry = 'UY' }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map?.getZoom() || 11);
  const [hoveredId, setHoveredId] = useState(null);
  const { lang: _awLang } = useLang();
  const _awT = useT();

  // Fronteira oficial do país atual (contorno no mapa) — reativa ao carregamento assíncrono
  const [boundaryRings, setBoundaryRings] = useState(getBoundaryRings(selectedCountry));
  useEffect(() => {
    setBoundaryRings(getBoundaryRings(selectedCountry));
    loadBoundary(selectedCountry);
    return onBoundary(() => setBoundaryRings(getBoundaryRings(selectedCountry)));
  }, [selectedCountry]);

  useMapEvents({
    zoomend: () => setZoom(map?.getZoom() || 11)
  });
  
  // Sempre mostrar cursos quando showWatercourses está ativo, independente de seleção
  // Apenas não mostrar se não há dados disponíveis
  
  // Mostrar todos os cursos quando nenhuma bacia está selecionada ou quando showWatercourses está ativo
  const shouldShowAll = activeBasins.size === 0 || activeBasins.size > 0;

  // Simplificação adaptativa — BR-RS usa menos simplificação para preservar forma dos rios
  const simplifyStep = selectedCountry === 'BR-RS'
    ? (zoom >= 14 ? 1 : zoom >= 12 ? 1 : zoom >= 10 ? 2 : 3)
    : (zoom >= 14 ? 1 : zoom >= 12 ? 2 : zoom >= 10 ? 3 : 5);

  // Pré-simplificar todos os paths dos tributários por zoom atual
  const simplifiedLines = useMemo(() => {
    if (!tributaryLines) return [];
    console.log('[DEBUG] simplifiedLines: tributaryLines.length =', tributaryLines.length);
    console.log('[DEBUG] activeBasins size:', activeBasins.size, 'activeBasins:', Array.from(activeBasins));
    const inActiveBasin = (regionId) => {
      // Se nenhuma bacia selecionada: mostrar todos
      if (activeBasins.size === 0) return true;
      if (!regionId) return false;
      // Verificação direta (ex: 'bacia_uruguai_BR-RS')
      if (activeBasins.has(regionId)) return true;
      // Verificação sem sufixo de país (ex: 'bacia_uruguai')
      const base = regionId.replace(/_[A-Z]{2}(-[A-Z]{2})?$/, '');
      return activeBasins.has(base);
    };
    // bbox do país selecionado para filtrar tributários fora dos limites
    const countryBbox = COUNTRIES.find(c => c.id === selectedCountry)?.bbox || null;
    const inCountryBbox = (paths) => {
      // BR-RS: dados já curados para o estado, sem filtro bbox no render
      if (selectedCountry === 'BR-RS') return true;
      if (!countryBbox) return true;
      const { minLat, maxLat, minLon, maxLon } = countryBbox;
      // Filtragem RIGOROSA: excluir se QUALQUER ponto estiver fora do bbox (evita SC/PR)
      for (const seg of paths) {
        for (const pt of seg) {
          if (!(pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon)) {
            return false; // Tem pontos fora
          }
        }
      }
      return true; // Todos os pontos dentro
    };
    const filtered = tributaryLines
      .filter(t => {
        if (!t?.paths?.length) return false;
        if (!inActiveBasin(t.regionId)) return false;
        if (!inCountryBbox(t.paths)) return false;
        return true;
      });
    
    console.log('[DEBUG] filtered tributaries:', filtered.length);
    
    // Log primeiros 5 rios com coordenadas para debug
    filtered.slice(0, 5).forEach((t, i) => {
      if (t.paths && t.paths.length > 0 && t.paths[0] && t.paths[0].length > 0) {
        const firstPoint = t.paths[0][0];
        const lastPoint = t.paths[0][t.paths[0].length - 1];
        console.log(`[DEBUG] Rio ${i+1}: ${t.name}`);
        console.log(`  Primeiro ponto: [${firstPoint[0]}, ${firstPoint[1]}]`);
        console.log(`  Último ponto: [${lastPoint[0]}, ${lastPoint[1]}]`);
        console.log(`  RegionId: ${t.regionId}`);
      }
    });
    
    // Log específico: cursos com pontos acima de -27.08 (possível SC/PR)
    const scCourses = filtered.filter(t => {
      if (!t.paths) return false;
      for (const seg of t.paths) {
        for (const pt of seg) {
          if (pt[0] > -27.08) return true; // Latitude maior que -27.08 = SC/PR
        }
      }
      return false;
    });
    if (scCourses.length > 0) {
      console.log(`[DEBUG] ⚠️ ENCONTRADOS ${scCourses.length} CURSOS COM PONTOS ACIMA DE -27.08 (SC/PR):`);
      scCourses.forEach(t => console.log(`  - ${t.name} (${t.regionId})`));
    } else {
      console.log('[DEBUG] ✅ Nenhum curso com pontos acima de -27.08 (SC/PR)');
    }
    
    // Log específico para cursos com "Ibicuí" ou "Lajeado" no nome
    const debugNames = ['ibicu', 'lajeado'];
    const debugCourses = filtered.filter(t => debugNames.some(n => t.name && t.name.toLowerCase().includes(n)));
    if (debugCourses.length > 0) {
      console.log(`[DEBUG] 🔍 CURSOS COM 'IBICUÍ' OU 'LAJEADO' RENDERIZADOS (${debugCourses.length}):`);
      debugCourses.forEach(t => {
        const firstPt = t.paths?.[0]?.[0];
        const lastPt = t.paths?.[0]?.[t.paths[0].length - 1];
        console.log(`  - ${t.name} (${t.regionId})`);
        console.log(`    Primeiro: [${firstPt?.[0]}, ${firstPt?.[1]}] Último: [${lastPt?.[0]}, ${lastPt?.[1]}]`);
      });
    }
    
    return filtered.map(t => ({ ...t, paths: t.paths.map(p => _simplifyBasinPath(p, simplifyStep)) }));
  }, [tributaryLines, activeBasins, simplifyStep, selectedCountry]);

  // Agrupar por bacia para passar ao BasinLayer memoizado
  const byBasin = useMemo(() => {
    const groups = {};
    for (const t of simplifiedLines) {
      const rid = t.regionId || 'santa_lucia';
      if (!groups[rid]) groups[rid] = [];
      groups[rid].push(t);
    }
    return groups;
  }, [simplifiedLines]);

  // Se não há dados de tributários e geometria do Santa Lucía, não renderiza nada
  if ((!tributaryLines || tributaryLines.length === 0) && (!santaLuciaGeometry || santaLuciaGeometry.length === 0)) return null;
  
  // Dados do Rio Santa Lúcia para o popup
  const santaLuciaQuality = waterQualityData?.['__santa_lucia__'];
  const santaLuciaScore = santaLuciaQuality?.quality_score || estimateWaterQualityHeuristic('Rio Santa Lucia', 'rio', 0, 0);
  const santaLuciaSpecies = species.filter(s => BIG_FISH_SPECIES.has(s.id)).slice(0, 5);
  
  // Peso base — para BR-RS usar linhas mais grossas em zoom baixo
  const lineWeight = selectedCountry === 'BR-RS'
    ? (zoom >= 14 ? 4 : zoom >= 12 ? 3 : zoom >= 10 ? 2.5 : 2)
    : (zoom >= 14 ? 4 : zoom >= 12 ? 2.5 : 1.8);
  const hitWeight = Math.max(44 - zoom * 2.5, 12);

  const REGION_COLORS = {
    bacia_uruguai:           '#f97316',
    bacia_uruguai_UY:        '#f97316',
    bacia_uruguai_AR:        '#f97316',
    bacia_uruguai_BR:        '#f97316',
    'bacia_uruguai_BR-RS':   '#f97316',
    bacia_rio_negro:         '#eab308',
    bacia_rio_negro_UY:      '#eab308',
    bacia_rio_negro_AR:      '#eab308',
    bacia_rio_negro_BR:      '#eab308',
    'bacia_rio_negro_BR-RS': '#eab308',
    bacia_merin:             '#ef4444',
    bacia_merin_UY:          '#ef4444',
    bacia_merin_BR:          '#ef4444',
    'bacia_merin_BR-RS':     '#ef4444',
    bacia_plata:             '#3b82f6',
    bacia_plata_UY:          '#3b82f6',
    bacia_plata_AR:          '#3b82f6',
    'bacia_plata_BR-RS':     '#3b82f6',
    vertente_atlantica:      '#a855f7',
    vertente_atlantica_UY:   '#a855f7',
    vertente_atlantica_BR:   '#a855f7',
    'vertente_atlantica_BR-RS': '#a855f7',
    bacia_santa_lucia:       '#22c55e',
    bacia_santa_lucia_UY:    '#22c55e',
    bacia_jacui:             '#22d3ee',
    'bacia_jacui_BR-RS':     '#22d3ee',
    bacia_lagopatos:         '#3b82f6',
    'bacia_lagopatos_BR-RS': '#3b82f6',
  };
  
  return (
    <>
      {/* Fronteira oficial da região (contorno no mapa) — RS=IBGE, UY=cuencas DINAGUA.
          Duas camadas: halo branco (legibilidade) + traço escuro nítido, com leve preenchimento. */}
      {boundaryRings && boundaryRings.map((ring, i) => (
        <React.Fragment key={`boundary-${selectedCountry}-${i}`}>
          {/* halo branco para destacar sobre qualquer fundo */}
          <Polygon
            positions={ring}
            interactive={false}
            pathOptions={{ color: '#ffffff', weight: 4.5, opacity: 0.55, fill: false, lineJoin: 'round', lineCap: 'round' }}
          />
          {/* traço principal escuro + leve preenchimento do estado */}
          <Polygon
            positions={ring}
            interactive={false}
            pathOptions={{ color: '#0f172a', weight: 1.8, opacity: 0.9, fillColor: '#38bdf8', fillOpacity: 0.05, lineJoin: 'round', lineCap: 'round' }}
          />
        </React.Fragment>
      ))}

      {/* Rio Santa Lúcia — linha principal azul (overlay herói legado; desativado:
          a bacia Santa Lucía da DINAGUA já desenha o rio na sua cor). */}
      {SHOW_LEGACY_HERO_RIVERS && selectedCountry === 'UY' && santaLuciaGeometry && activeBasins.has('bacia_plata') && (
        <>
          {hoveredId === '__santa_lucia__' && (
            <Polyline positions={santaLuciaGeometry}
              pathOptions={{ color: '#93c5fd', weight: (lineWeight+1)*3.5, opacity: 0.3, lineCap:'round', lineJoin:'round' }}
              renderer={_canvasRenderer}
            />
          )}
          <Polyline positions={santaLuciaGeometry}
            pathOptions={{ color: hoveredId==='__santa_lucia__' ? '#3b82f6' : '#1a6fd4', weight: lineWeight+1,
              opacity: hoveredId==='__santa_lucia__' ? 1 : 0.85, lineCap:'round', lineJoin:'round' }}
            renderer={_canvasRenderer}
            eventHandlers={{ mouseover: ()=>setHoveredId('__santa_lucia__'), mouseout: ()=>setHoveredId(null) }}
          />
          <Polyline positions={santaLuciaGeometry}
            pathOptions={{ color:'transparent', weight: Math.max(hitWeight,(lineWeight+1)*3), opacity:0.001 }}
            eventHandlers={{ mouseover: ()=>setHoveredId('__santa_lucia__'), mouseout: ()=>setHoveredId(null) }}
          >
            <Popup>
              <div style={{ minWidth:210, maxWidth:270, background:'#0f172a', padding:12, borderRadius:8, color:'#e5f6ff' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:'1.2rem' }}>🌊</span>
                  <div>
                    <strong style={{ fontSize:'0.9rem', display:'block' }}>Rio Santa Lúcia</strong>
                    <div style={{ fontSize:'0.72rem', color:'#94a3b8' }}>{_awT('popupMainRiver')} · {_awT('popupBasin')} Santa Lucía</div>
                  </div>
                </div>
                <div style={{ fontSize:'0.72rem', color:'#64748b', fontStyle:'italic' }}>
                  💡 {_awT('popupSelectHeatmapDetail')}
                </div>
              </div>
            </Popup>
          </Polyline>
        </>
      )}

      {/* Tributários agrupados por bacia */}
      {Object.entries(byBasin).map(([rid, tribs]) => (
        <BasinLayer
          key={`${rid}-${selectedCountry}`}
          regionId={rid}
          tributaries={tribs}
          color={REGION_COLORS[rid] || '#3b82f6'}
          lineWeight={lineWeight}
          hitWeight={hitWeight}
          waterQualityData={waterQualityData}
          species={species}
          occurrences={occurrences}
        />
      ))}

      {/* EXTRA_RIVERS — rios/lagoas "herói" legados (overlay na cor própria, ex.: Río
          Negro em azul). Desativado: a rede oficial por bacia já os cobre. */}
      {SHOW_LEGACY_HERO_RIVERS && extraRivers.filter(r => {
        const riverCountry = r.country || 'UY';
        if (riverCountry !== selectedCountry) return false;
        // Para BR-RS, usar polígono preciso em vez de bbox
        if (selectedCountry === 'BR-RS') {
          const paths = extraRiverGeometries[r.id];
          if (!paths?.length) return true; // Sem geometria, mostrar como marcador
          // Verificar se pelo menos 50% dos pontos estão dentro do RS
          let inside = 0, total = 0;
          for (const seg of paths) {
            for (const pt of seg) {
              total++;
              if (isPointInRS(pt[0], pt[1])) inside++;
            }
          }
          const ratio = total > 0 ? inside / total : 0;
          if (ratio < 0.3) {
            console.log('[DEBUG] 🚫 FILTRANDO EXTRA_RIVER (fora do RS):', r.name, `${(ratio*100).toFixed(0)}%`);
            return false;
          }
          return true;
        }
        // Para outros países, usar bbox
        const countryBbox = COUNTRIES.find(c => c.id === selectedCountry)?.bbox;
        if (!countryBbox) return true;
        const { minLat, maxLat, minLon, maxLon } = countryBbox;
        const paths = extraRiverGeometries[r.id];
        if (!paths?.length) return true;
        for (const seg of paths) {
          for (const pt of seg) {
            if (!(pt[0] >= minLat && pt[0] <= maxLat && pt[1] >= minLon && pt[1] <= maxLon)) {
              return false;
            }
          }
        }
        return true;
      }).map(r => {
        const regionId = r.regionId || null;
        const baseRegion = regionId?.replace(/_[A-Z]{2}(-[A-Z]{2})?$/, '');
        if (regionId && baseRegion && !activeBasins.has(baseRegion) && !activeBasins.has(regionId)) return null;
        const isLagoon = r.type === 'lagoon';
        const isEstuary = r.type === 'estuario';
        const color = r.color || (isLagoon ? '#38bdf8' : isEstuary ? '#818cf8' : '#3b82f6');
        const wcType = r.type || classifyWatercourse(r.name || '');
        const allowedIds = SPECIES_BY_WATERCOURSE[wcType] || [];
        const speciesList = allowedIds.map(id => species.find(s => s.id === id)).filter(Boolean);
        const courseOccurrences = (occurrences||[]).filter(o=>o.watercourseId===r.id||o.watercourseName===r.name).length;

        const popupContent = (
          <Popup>
            <div style={{ minWidth:200, maxWidth:260, color:'#f1f5f9' }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', color, marginBottom:3 }}>
                {isLagoon?'🏞️':isEstuary?'🌊':'〰️'} {r.name}
              </div>
              <div style={{ fontSize:'0.72rem', color:'#94a3b8', marginBottom:5 }}>
                {isLagoon ? _awT('popupLake') : _awT('popupRiverStream')}{r.zoom?` · zoom ${r.zoom}`:''}
              </div>
              <div style={{ fontSize:'0.75rem', background:'#1e293b', borderRadius:5, padding:'5px 8px', marginBottom:5 }}>
                🎣 {speciesList.length>0 ? speciesList.slice(0,4).map(s=>spName(s,_awLang)).join(', ')+(speciesList.length>4?'…':'') : _awT('popupSelectForSpecies')}
              </div>
              {courseOccurrences>0 && <div style={{ fontSize:'0.72rem', color:'#22c55e' }}>✔ {courseOccurrences} {courseOccurrences>1 ? _awT('popupRegisteredPl') : _awT('popupRegistered')}</div>}
              <div style={{ fontSize:'0.68rem', color:'#475569', marginTop:4, fontStyle:'italic' }}>💡 {_awT('popupSelectHeatmap')}</div>
            </div>
          </Popup>
        );

        const paths = extraRiverGeometries[r.id];
        if (paths?.length > 0) {
          return paths.map((path, i) =>
            isLagoon ? (
              <Polygon key={`ex-${r.id}-${i}`} positions={path}
                pathOptions={{ color, weight:1.5, opacity:0.7, fillColor:color, fillOpacity:0.12 }}>
                {i===0?popupContent:null}
              </Polygon>
            ) : (
              <React.Fragment key={`ex-${r.id}-${i}`}>
                <Polyline positions={path} pathOptions={{ color, weight:lineWeight, opacity:0.65, lineCap:'round', lineJoin:'round' }} renderer={_canvasRenderer} />
                <Polyline positions={path} pathOptions={{ color:'transparent', weight:Math.max(lineWeight*3,8), opacity:0.001 }}>
                  {i===0?popupContent:null}
                </Polyline>
              </React.Fragment>
            )
          );
        }
        return (
          <CircleMarker key={`ex-fb-${r.id}`} center={r.center} radius={isLagoon?7:5}
            pathOptions={{ color, fillColor:color, fillOpacity:0.5, weight:1.5, opacity:0.8, dashArray:isLagoon?null:'3 2' }}>
            {popupContent}
          </CircleMarker>
        );
      })}
    </>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary] Error:', error?.message || error, '\nStack:', error?.stack, '\nComponent stack:', info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#06141b', color: '#f87171', gap: 16, fontFamily: 'Inter, sans-serif' }}>
          <AlertTriangle size={48} />
          <h2 style={{ margin: 0 }}>Algo deu errado</h2>
          <p style={{ color: '#94a3b8', margin: 0 }}>Recarregue a página para tentar novamente.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: '#1a6fd4', color: '#fff', border: 'none', cursor: 'pointer' }}>Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// Modal de Pescaria Ativa
// ============================================================

function FishingSessionModal({ 
  isOpen, 
  onClose,
  onMinimize,
  step,
  setStep,
  activeSession,
  setActiveSession,
  catches,
  setCatches,
  species,
  watercourseList,
  userLocation,
  onSessionCreated,
  onCatchAdded
}) {
  const toast = useToast();
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Para adicionar captura
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [baitType, setBaitType] = useState('');
  const [catchNotes, setCatchNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fishIdOpen, setFishIdOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');

  function normalizeStr(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Lista de locais ordenada por proximidade e filtrada por busca
  const sortedLocations = useMemo(() => {
    if (!watercourseList || watercourseList.length === 0) return [];
    const sorted = userLocation
      ? [...watercourseList].sort((a, b) => (a.distKm || Infinity) - (b.distKm || Infinity))
      : watercourseList;
    if (!locationSearch.trim()) return sorted;
    const q = normalizeStr(locationSearch.trim());
    return sorted.filter((w) => normalizeStr(w.name).includes(q));
  }, [watercourseList, userLocation, locationSearch]);
  
  if (!isOpen) return null;
  
  const handleStartSession = async () => {
    if (!selectedLocation) return;
    
    setLoading(true);
    try {
      const session = await createFishingSession({
        title: sessionTitle || `Pescaria em ${selectedLocation.name}`,
        watercourseId: selectedLocation.id,
        watercourseName: selectedLocation.name,
        watercourseType: selectedLocation.type,
        lat: userLocation?.lat,
        lon: userLocation?.lon,
        weather: null, // Pode ser preenchido com dados reais
        moonPhase: null,
        notes: ''
      });
      
      setActiveSession(session);
      onSessionCreated?.(session);
      setStep('active');
    } catch (err) {
      console.error('Failed to start session:', err);
      toast.error('Erro ao iniciar pescaria: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!confirm('Deseja encerrar esta pescaria?')) return;
    
    setLoading(true);
    try {
      await updateFishingSession(activeSession.id, {
        status: 'completed',
        endedAt: new Date().toISOString()
      });
      
      setActiveSession(null);
      setCatches([]);
      setStep('select-location');
      onClose();
    } catch (err) {
      console.error('Failed to end session:', err);
      toast.error('Erro ao encerrar pescaria: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddCatch = async () => {
    if (!activeSession || !selectedSpecies) return;
    
    setLoading(true);
    try {
      let photoUrls = [];
      
      // Upload fotos
      if (photos.length > 0) {
        setUploading(true);
        for (const photo of photos) {
          const url = await uploadCatchPhoto(photo, activeSession.id);
          photoUrls.push(url);
        }
        setUploading(false);
      }
      
      const speciesData = species.find(s => s.id === selectedSpecies);
      const newCatch = await addCatch(activeSession.id, {
        speciesId: selectedSpecies,
        speciesName: speciesData?.name || selectedSpecies,
        weightKg: weight ? parseFloat(weight) : null,
        lengthCm: length ? parseFloat(length) : null,
        lat: userLocation?.lat,
        lon: userLocation?.lon,
        baitType,
        notes: catchNotes,
        photoUrls
      });

      if (baitType.trim()) {
        recordBaitUse(selectedSpecies, baitType.trim(), null).catch(() => {});
      }
      
      // Atualiza lista de capturas
      setCatches(prev => [newCatch, ...prev]);
      
      // Atualiza métricas da sessão
      const totalCatches = catches.length + 1;
      const totalWeight = catches.reduce((sum, c) => sum + (c.weight_kg || 0), 0) + (newCatch.weight_kg || 0);
      
      await updateFishingSession(activeSession.id, {
        totalCatches,
        totalWeightKg: totalWeight > 0 ? totalWeight : null
      });
      
      // Limpa formulário
      setSelectedSpecies('');
      setWeight('');
      setLength('');
      setBaitType('');
      setCatchNotes('');
      setPhotos([]);
      
      onCatchAdded?.(newCatch);
      toast.success('Captura registrada com sucesso! 🎣');
    } catch (err) {
      console.error('Failed to add catch:', err);
      toast.error('Erro ao registrar captura: ' + err.message);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };
  
  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 5) {
      toast.error('Máximo de 5 fotos por captura');
      return;
    }
    setPhotos(files);
  };
  
  return (
    <>
    <div className="planner-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="planner-modal" style={{ maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
        <div className="planner-header">
          <div className="planner-title">
            <span style={{ fontSize: '1.2rem' }}>🎣</span>
            <span>
              {step === 'select-location' && 'Iniciar Pescaria'}
              {step === 'active' && (activeSession?.title || 'Pescaria em andamento')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {step === 'active' && onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title="Minimizar"
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, fontSize: '1rem', lineHeight: 1 }}
              >⎯</button>
            )}
            <button className="planner-close" onClick={onClose} type="button"><X size={18} /></button>
          </div>
        </div>
        
        <div className="planner-body">
          {/* Step 1: Seleção de local */}
          {step === 'select-location' && (
            <div>
              <div className="planner-section">
                <h3>Selecione o local</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: -8 }}>
                  O primeiro local é o mais próximo de você
                </p>
                
                <div style={{ position: 'relative', marginTop: 12, marginBottom: 8 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar por nome…"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    autoFocus
                    style={{ width: '100%', padding: '8px 32px 8px 32px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e5f6ff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {locationSearch && (
                    <button type="button" onClick={() => setLocationSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                      <X size={13} />
                    </button>
                  )}
                </div>

              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {sortedLocations.length === 0 && (
                    <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>Nenhum local encontrado.</p>
                  )}
                  {sortedLocations.map((loc, idx) => (
                    <button
                      key={loc.id}
                      onClick={() => setSelectedLocation(loc)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        marginBottom: 8,
                        background: selectedLocation?.id === loc.id ? 'rgba(26,111,212,0.2)' : 'rgba(255,255,255,0.05)',
                        border: selectedLocation?.id === loc.id ? '1px solid #1a6fd4' : '1px solid transparent',
                        borderRadius: 8,
                        color: '#e5f6ff',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      type="button"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1rem' }}>
                          {idx === 0 ? '📍' : '〰️'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: idx === 0 ? '#22c55e' : 'inherit' }}>
                            {loc.name}
                          </strong>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {loc.distKm < 1 
                              ? `${Math.round(loc.distKm * 1000)}m de distância` 
                              : `${loc.distKm.toFixed(1)}km de distância`}
                            {loc.waterQuality && ` • Qualidade: ${loc.waterQuality}%`}
                          </div>
                        </div>
                        {idx === 0 && (
                          <span style={{ fontSize: '0.7rem', background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>
                            Mais próximo
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="planner-section">
                <h3>Título da pescaria (opcional)</h3>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="Ex: Pescaria de domingo"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 6,
                    color: '#e5f6ff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              
              <div className="planner-footer">
                <button 
                  className="btn-secondary" 
                  onClick={onClose}
                  type="button"
                >
                  Cancelar
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleStartSession}
                  disabled={!selectedLocation || loading}
                  type="button"
                >
                  {loading ? 'Iniciando...' : 'Iniciar Pescaria 🎣'}
                </button>
              </div>
            </div>
          )}
          
          {/* Step 2: Pescaria ativa */}
          {step === 'active' && activeSession && (
            <div>
              {/* Resumo da sessão */}
              <div className="planner-section" style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Local</div>
                    <div style={{ fontWeight: 600 }}>{activeSession.watercourse_name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const text = [
                          `🎣 Pescaria ao vivo em ${activeSession.watercourse_name || 'Rio Santa Lucía'}`,
                          catches.length > 0 ? `🐟 ${catches.length} captura${catches.length !== 1 ? 's' : ''} até agora` : '🎣 Acabou de começar!',
                          `\n🗺️ Via Pescamon — ${window.location.origin}`,
                        ].join('\n');
                        if (navigator.share) {
                          navigator.share({ title: 'Pescaria ao vivo', text });
                        } else {
                          navigator.clipboard.writeText(text).then(() => toast.success('Link copiado!'));
                        }
                      }}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 9px', borderRadius:7, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.07)', color:'#7ab8f5', cursor:'pointer', fontSize:'0.75rem' }}
                    >
                      <Share2 size={12} /> Compartilhar
                    </button>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Capturas</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{catches.length}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Lista de capturas */}
              {catches.length > 0 && (
                <div className="planner-section">
                  <h3>Capturas registradas</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catches.map((c, idx) => (
                      <div 
                        key={c.id}
                        style={{
                          padding: 12,
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                      >
                        <span style={{ fontSize: '1.5rem' }}>🐟</span>
                        <div style={{ flex: 1 }}>
                          <strong>{c.species_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {c.weight_kg && `${c.weight_kg.toFixed(2)}kg `}
                            {c.length_cm && `${c.length_cm.toFixed(1)}cm `}
                            • {new Date(c.caught_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {c.photo_urls?.length > 0 && (
                          <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                            📷 {c.photo_urls.length}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Adicionar captura */}
              <div className="planner-section">
                <h3>Registrar nova captura</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Espécie *</label>
                      <button
                        type="button"
                        onClick={() => setFishIdOpen(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6,
                          border: '1px solid rgba(34,211,238,0.35)',
                          background: 'rgba(34,211,238,0.08)',
                          color: '#22d3ee', fontSize: '0.72rem', cursor: 'pointer',
                        }}
                      >
                        🔍 Identificar por foto
                      </button>
                    </div>
                    <select
                      value={selectedSpecies}
                      onChange={(e) => setSelectedSpecies(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: '#0f2233',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        color: '#e5f6ff',
                        fontSize: '0.9rem',
                        appearance: 'auto',
                      }}
                    >
                      <option value="" style={{ background: '#0f2233', color: '#94a3b8' }}>Selecione...</option>
                      {species.map(s => (
                        <option key={s.id} value={s.id} style={{ background: '#0f2233', color: '#e5f6ff' }}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        Peso (kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="0.00"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 6,
                          color: '#e5f6ff',
                          fontSize: '0.9rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        Tamanho (cm)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        placeholder="0.0"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 6,
                          color: '#e5f6ff',
                          fontSize: '0.9rem'
                        }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                      Isca/Equipamento
                    </label>
                    <input
                      type="text"
                      value={baitType}
                      onChange={(e) => setBaitType(e.target.value)}
                      placeholder="Ex: Minhoca, isca artificial..."
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        color: '#e5f6ff',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                      Fotos (máx. 5)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoChange}
                      style={{
                        width: '100%',
                        padding: 8,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px dashed rgba(255,255,255,0.3)',
                        borderRadius: 6,
                        color: '#e5f6ff',
                        fontSize: '0.85rem'
                      }}
                    />
                    {photos.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: 4 }}>
                        {photos.length} foto(s) selecionada(s)
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                      Observações
                    </label>
                    <textarea
                      value={catchNotes}
                      onChange={(e) => setCatchNotes(e.target.value)}
                      placeholder="Condições, comportamento do peixe, etc..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        color: '#e5f6ff',
                        fontSize: '0.9rem',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                  
                  <button
                    onClick={handleAddCatch}
                    disabled={!selectedSpecies || loading || uploading}
                    style={{
                      padding: '12px',
                      background: selectedSpecies ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: 8,
                      color: '#fff',
                      fontWeight: 600,
                      cursor: selectedSpecies ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                    type="button"
                  >
                    {uploading ? '📤 Enviando fotos...' : loading ? 'Salvando...' : '🐟 Registrar Captura'}
                  </button>
                </div>
              </div>
              
              <div className="planner-footer">
                <button 
                  className="btn-secondary" 
                  onClick={() => setStep('select-location')}
                  type="button"
                >
                  Voltar
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleEndSession}
                  disabled={loading}
                  style={{ background: '#ef4444' }}
                  type="button"
                >
                  {loading ? 'Encerrando...' : 'Encerrar Pescaria'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {fishIdOpen && (
      <FishIDModal
        open={fishIdOpen}
        onClose={() => setFishIdOpen(false)}
        onConfirm={(speciesId) => {
          const match = species.find(s => s.id === speciesId || s.name?.toLowerCase().includes(speciesId.replace(/_/g, ' ')));
          if (match) setSelectedSpecies(match.id);
          setFishIdOpen(false);
        }}
        location={userLocation}
        supabaseUrl={import.meta.env.VITE_SUPABASE_URL || ''}
        supabaseKey={import.meta.env.VITE_SUPABASE_ANON_KEY || ''}
        lang="pt"
      />
    )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><LangProvider><ThemeProvider><ToastProvider><App /></ToastProvider></ThemeProvider></LangProvider></ErrorBoundary>);
