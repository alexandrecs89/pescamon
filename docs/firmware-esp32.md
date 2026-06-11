# 🔌 Firmware ESP32 — Pescamon IoT Sensor

Guia para construir e programar sensores de campo que enviam dados em tempo real para a plataforma Pescamon via HTTP/REST → Supabase.

---

## 📦 Hardware necessário (custo estimado < $50 USD)

| Componente | Modelo recomendado | Preço aprox. |
|---|---|---|
| Microcontrolador | ESP32 DevKit v1 (30 pinos) | $4–6 |
| Sensor de temperatura | DS18B20 à prova d'água (1-Wire) | $3–5 |
| Sensor de nível | JSN-SR04T ultrassônico | $5–8 |
| Sensor de pH (opcional) | SEN0169 DFRobot Gravity | $25–35 |
| Sensor de turbidez (opcional) | SEN0189 DFRobot | $12–18 |
| Caixa estanque | IP67 ABS | $5–8 |
| Bateria LiPo | 3.7V 2000mAh + módulo TP4056 | $4–6 |
| Painel solar (opcional) | 5V 1W mini | $3–5 |
| **Total básico** | | **~$20–35** |
| **Total completo** | | **~$50** |

---

## 🔗 Protocolo de comunicação

```
ESP32 → WiFi → HTTPS POST → Supabase REST API
```

Intervalo de envio recomendado: **5 minutos** (sleep profundo entre leituras para economizar bateria).

---

## 📡 Payload JSON

O sensor envia um `upsert` na tabela `iot_sensors` com o seguinte payload:

```json
{
  "id": "sensor-pache-01",
  "name": "Paso Pache",
  "lat": -34.682,
  "lng": -56.147,
  "water_temp": 16.3,
  "water_level": 1.42,
  "water_ph": 7.2,
  "water_turbidity": 12.5,
  "battery": 87,
  "updated_at": "2025-01-15T14:30:00Z"
}
```

### Campos

| Campo | Tipo | Unidade | Obrigatório |
|---|---|---|---|
| `id` | `text` | — | ✅ único por sensor |
| `name` | `text` | — | ✅ nome descritivo |
| `lat` | `float` | graus decimais | ✅ |
| `lng` | `float` | graus decimais | ✅ |
| `water_temp` | `float` | °C | ✅ |
| `water_level` | `float` | metros | recomendado |
| `water_ph` | `float` | 0–14 | opcional |
| `water_turbidity` | `float` | NTU | opcional |
| `battery` | `int` | % (0–100) | recomendado |
| `updated_at` | `timestamptz` | ISO 8601 UTC | ✅ |

---

## 💻 Código Arduino (ESP32)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>

// ── Configuração ─────────────────────────────────────────
const char* WIFI_SSID     = "SUA_REDE";
const char* WIFI_PASSWORD = "SUA_SENHA";

// Supabase — obtenha em: Settings > API > Project URL e anon key
const char* SUPABASE_URL  = "https://SEU_PROJETO.supabase.co";
const char* SUPABASE_KEY  = "SUA_ANON_KEY";

// Identificação única deste sensor (escolha um ID fixo por dispositivo)
const char* SENSOR_ID     = "sensor-pache-01";
const char* SENSOR_NAME   = "Paso Pache";
const float SENSOR_LAT    = -34.682;
const float SENSOR_LNG    = -56.147;

// ── Pinos ────────────────────────────────────────────────
#define PIN_TEMP        4    // DS18B20 data
#define PIN_TRIG        5    // Ultrassônico trigger
#define PIN_ECHO        18   // Ultrassônico echo
#define PIN_PH_ANALOG   34   // pH analógico (ADC)
#define PIN_TURBIDITY   35   // Turbidez analógico (ADC)
#define PIN_BATTERY     36   // Divisor de tensão bateria

// ── Deep sleep ───────────────────────────────────────────
#define SLEEP_MINUTES   5
#define uS_TO_S_FACTOR  1000000ULL

// ── Sensores ─────────────────────────────────────────────
OneWire oneWire(PIN_TEMP);
DallasTemperature tempSensor(&oneWire);

// ─────────────────────────────────────────────────────────

float readTemperature() {
  tempSensor.begin();
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  return (t == DEVICE_DISCONNECTED_C) ? -999 : t;
}

float readWaterLevel() {
  // JSN-SR04T: distância em cm → converter para nível em metros
  // Ajuste SENSOR_HEIGHT_CM para a altura do sensor acima da água máxima
  const float SENSOR_HEIGHT_CM = 200.0;
  digitalWrite(PIN_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duration = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duration == 0) return -1;
  float distCm = duration * 0.034 / 2.0;
  float level = (SENSOR_HEIGHT_CM - distCm) / 100.0; // metros
  return max(0.0f, level);
}

float readPH() {
  // Calibração SEN0169: Vout = 3.5 @ pH 7, slope = -0.18V/pH
  int raw = analogRead(PIN_PH_ANALOG);
  float voltage = raw * (3.3 / 4095.0);
  return 7.0 + (3.5 - voltage) / 0.18;
}

float readTurbidity() {
  // SEN0189: 0 NTU = ~4.2V; > 3000 NTU = ~2.5V (curva não-linear)
  int raw = analogRead(PIN_TURBIDITY);
  float voltage = raw * (3.3 / 4095.0);
  if (voltage < 2.5) return 3000;
  return -1120.4 * voltage * voltage + 5742.3 * voltage - 4353.8;
}

int readBattery() {
  // Divisor de tensão: Vbat → R1(100k)/R2(100k) → ADC
  // LiPo 4.2V cheio → ~2.1V no ADC → 4095 raw @ 3.3V ref
  int raw = analogRead(PIN_BATTERY);
  float vAdc = raw * (3.3 / 4095.0);
  float vBat = vAdc * 2.0; // compensar divisor
  // 4.2V = 100%, 3.3V = 0%
  int pct = (int)((vBat - 3.3) / (4.2 - 3.3) * 100);
  return constrain(pct, 0, 100);
}

String getISOTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 5000)) return "1970-01-01T00:00:00Z";
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void sendToSupabase(float temp, float level, float ph, float turbidity, int battery) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/iot_sensors";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Prefer", "resolution=merge-duplicates"); // upsert

  StaticJsonDocument<512> doc;
  doc["id"]               = SENSOR_ID;
  doc["name"]             = SENSOR_NAME;
  doc["lat"]              = SENSOR_LAT;
  doc["lng"]              = SENSOR_LNG;
  doc["water_temp"]       = (temp > -998) ? temp : (float)NULL;
  doc["water_level"]      = (level >= 0) ? level : (float)NULL;
  if (ph > 0 && ph < 14)       doc["water_ph"]         = ph;
  if (turbidity >= 0)          doc["water_turbidity"]   = turbidity;
  doc["battery"]          = battery;
  doc["updated_at"]       = getISOTime();

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("[HTTP] POST %s → %d\n", url.c_str(), code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  // Conectar WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi...");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500); Serial.print("."); attempts++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK" : " FALHOU");

  // Ler sensores
  float temp       = readTemperature();
  float level      = readWaterLevel();
  float ph         = readPH();
  float turbidity  = readTurbidity();
  int   battery    = readBattery();

  Serial.printf("Temp=%.1f°C Nível=%.2fm pH=%.1f Turb=%.0f NTU Bat=%d%%\n",
    temp, level, ph, turbidity, battery);

  // Enviar
  sendToSupabase(temp, level, ph, turbidity, battery);

  // Deep sleep
  Serial.printf("Sleep %d min...\n", SLEEP_MINUTES);
  esp_sleep_enable_timer_wakeup(SLEEP_MINUTES * 60 * uS_TO_S_FACTOR);
  esp_deep_sleep_start();
}

void loop() {
  // Nunca executado — deep sleep reinicia setup()
}
```

---

## 📦 Bibliotecas Arduino necessárias

Instale via Arduino IDE > Library Manager:

- `ArduinoJson` by Benoit Blanchon (v6+)
- `DallasTemperature` by Miles Burton
- `OneWire` by Paul Stoffregen

ESP32 board package: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

---

## 🔐 Segurança

- Nunca commitar `WIFI_PASSWORD` ou `SUPABASE_KEY` em código público
- Use a **anon key** (não a service role key) para sensores de campo
- A RLS do Supabase permite inserção/atualização sem autenticação completa para sensores

---

## 🌞 Autonomia com painel solar

| Configuração | Autonomia estimada |
|---|---|
| Só bateria 2000mAh | ~7–10 dias |
| Bateria + painel 1W (full sun) | Indefinida (recarrega > gasta) |
| Bateria + painel 1W (nublado) | ~30–60 dias |

Sleep de 5 min consome ~0.12 mAh médio.

---

## 📋 Checklist de implantação

- [ ] Flash firmware com credenciais corretas
- [ ] Calibrar pH com solução tampão pH 4 e pH 7
- [ ] Medir altura do sensor ultrassônico acima do nível d'água máximo
- [ ] Adicionar sensor no painel Admin IoT da plataforma (com lat/lng exatos)
- [ ] Testar recepção na aba "Sensores IoT" do aplicativo
- [ ] Selar caixa com silicone e verificar IP67
