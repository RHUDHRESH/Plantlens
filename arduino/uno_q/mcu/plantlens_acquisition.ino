/*
  PlantLens UNO Q MCU acquisition template.

  Adapt pin assignments, scaling, and sensor drivers to the exact hardware.
  The sketch deliberately does not control the motor. It samples sensing inputs,
  counts RPM pulses, and emits quality-stamped rows. It is read-only.

  What changed and why (see apps/gateway/README.md):
  - The ADC is sampled at SAMPLE_RATE_HZ (800 Hz) but rows are EMITTED at EMIT_RATE_HZ as
    per-window aggregates (mean, and peak-to-peak for vibration). 800 rows/s x ~40 B = 320 kbit/s
    exceeded what the serial link could carry and blocked loop() whenever the TX buffer filled.
  - 115200 baud instead of 921600 (not reliable on every USB-UART bridge / host driver).
  - analogReadResolution(12) where the core supports it, so the 4094 saturation check is real;
    the saturation thresholds follow the actual ADC range.
  - Output is header-driven CSV the gateway parses (GATEWAY_LINE__PROTOCOL=csv or auto):
        #PLANTLENS READY v1 ...
        seq,t_ms,vib_mean,vib_p2p,current_mean,voltage_mean,airflow_mean,rpm_hz,quality
    The header (and banner) is re-emitted every HEADER_EVERY_MS so a row stream joined after the
    reset window is decodable within seconds. Map columns to tags with GATEWAY_LINE__COLUMN_MAP.
  - Printing never blocks: the row is buffered and fed to Serial as availableForWrite() allows;
    if the previous row is still sending, the new row is dropped and counted (seq gap).
*/

#include <Arduino.h>

#if defined(ARDUINO_ARCH_ZEPHYR) || defined(ARDUINO_ARCH_RENESAS) || defined(ARDUINO_ARCH_SAMD) || \
    defined(ARDUINO_ARCH_MBED) || defined(ARDUINO_ARCH_STM32) || defined(ARDUINO_ARCH_ESP32) || defined(ARDUINO_ARCH_RP2040)
#define PL_HAS_ADC_RESOLUTION 1
static const int ADC_MAX = 4095;
#else
#define PL_HAS_ADC_RESOLUTION 0
static const int ADC_MAX = 1023;
#endif

constexpr uint8_t PIN_VIBRATION = A0;
constexpr uint8_t PIN_CURRENT = A1;
constexpr uint8_t PIN_VOLTAGE = A2;
constexpr uint8_t PIN_AIRFLOW = A3;
constexpr uint8_t PIN_RPM = 2;
constexpr uint8_t PIN_ALERT = LED_BUILTIN;

constexpr uint32_t BAUD = 115200;
constexpr uint32_t SAMPLE_RATE_HZ = 800;
constexpr uint32_t SAMPLE_PERIOD_US = 1000000UL / SAMPLE_RATE_HZ;
constexpr uint32_t EMIT_RATE_HZ = 25;
constexpr uint32_t EMIT_PERIOD_MS = 1000UL / EMIT_RATE_HZ;
constexpr uint32_t MAX_ROW_BYTES = 96;
constexpr uint32_t HEADER_EVERY_MS = 5000;
// Rate limit: rows must use at most 60 % of the link (10 bits per byte on the wire).
static_assert(EMIT_RATE_HZ * MAX_ROW_BYTES * 10UL <= BAUD * 6UL / 10UL, "EMIT_RATE_HZ too high for BAUD");

static const char HEADER[] = "seq,t_ms,vib_mean,vib_p2p,current_mean,voltage_mean,airflow_mean,rpm_hz,quality";

volatile uint32_t rpmPulses = 0;
uint32_t sequenceNumber = 0;
uint32_t drops = 0;
uint32_t lastSampleUs = 0;
uint32_t windowStartMs = 0;
uint32_t lastHeaderMs = 0;

// Window accumulators
uint32_t nSamples = 0;
uint32_t sumVib = 0, sumCur = 0, sumVolt = 0, sumAir = 0;
int minVib = 0x7FFF, maxVib = -1;
bool saturated = false;

char txBuf[128];
size_t txLen = 0, txPos = 0;

void onRpmPulse() { rpmPulses++; }

bool txBusy() { return txPos < txLen; }

bool queueText(const String& text) {
  if (txBusy() || text.length() + 2 > sizeof(txBuf)) return false;
  memcpy(txBuf, text.c_str(), text.length());
  txBuf[text.length()] = '\r';
  txBuf[text.length() + 1] = '\n';
  txLen = text.length() + 2;
  txPos = 0;
  return true;
}

void pumpSerial() {
  if (!txBusy()) return;
  int room = Serial.availableForWrite();
  if (room <= 0) return;
  size_t n = min((size_t)room, txLen - txPos);
  Serial.write(reinterpret_cast<const uint8_t*>(txBuf) + txPos, n);
  txPos += n;
}

void resetWindow() {
  nSamples = 0;
  sumVib = sumCur = sumVolt = sumAir = 0;
  minVib = 0x7FFF;
  maxVib = -1;
  saturated = false;
}

void setup() {
  Serial.begin(BAUD);
#if PL_HAS_ADC_RESOLUTION
  analogReadResolution(12);
#endif
  pinMode(PIN_RPM, INPUT_PULLUP);
  pinMode(PIN_ALERT, OUTPUT);
  digitalWrite(PIN_ALERT, LOW);
  attachInterrupt(digitalPinToInterrupt(PIN_RPM), onRpmPulse, RISING);
  resetWindow();
  windowStartMs = millis();
  lastHeaderMs = windowStartMs - HEADER_EVERY_MS;  // header right after the banner
  lastSampleUs = micros();
  queueText(String("#PLANTLENS READY v1 source=uno_q adc_max=") + ADC_MAX);
}

void sampleOnce() {
  const int vibration = analogRead(PIN_VIBRATION);
  const int current = analogRead(PIN_CURRENT);
  const int voltage = analogRead(PIN_VOLTAGE);
  const int airflow = analogRead(PIN_AIRFLOW);
  sumVib += vibration;
  sumCur += current;
  sumVolt += voltage;
  sumAir += airflow;
  if (vibration < minVib) minVib = vibration;
  if (vibration > maxVib) maxVib = vibration;
  if (vibration <= 1 || vibration >= ADC_MAX - 1 || current <= 1 || current >= ADC_MAX - 1) saturated = true;
  ++nSamples;
}

void emitRow(uint32_t nowMs) {
  noInterrupts();
  const uint32_t pulses = rpmPulses;
  rpmPulses = 0;
  interrupts();
  const uint32_t windowMs = nowMs - windowStartMs;
  if (txBusy() || nSamples == 0) {
    ++drops;
    ++sequenceNumber;
    return;
  }
  const float n = static_cast<float>(nSamples);
  String row;
  row.reserve(MAX_ROW_BYTES);
  row += sequenceNumber++;
  row += ',';
  row += nowMs;
  row += ',';
  row += String(sumVib / n, 1);
  row += ',';
  row += (maxVib - minVib);
  row += ',';
  row += String(sumCur / n, 1);
  row += ',';
  row += String(sumVolt / n, 1);
  row += ',';
  row += String(sumAir / n, 1);
  row += ',';
  row += String(windowMs ? pulses * 1000.0f / windowMs : 0.0f, 2);
  row += ',';
  row += saturated ? "BAD" : "GOOD";
  queueText(row);
}

void loop() {
  pumpSerial();
  const uint32_t nowUs = micros();
  if (static_cast<uint32_t>(nowUs - lastSampleUs) >= SAMPLE_PERIOD_US) {
    lastSampleUs += SAMPLE_PERIOD_US;
    if (static_cast<uint32_t>(nowUs - lastSampleUs) >= SAMPLE_PERIOD_US) lastSampleUs = nowUs;
    sampleOnce();
  }
  const uint32_t nowMs = millis();
  if (static_cast<uint32_t>(nowMs - windowStartMs) >= EMIT_PERIOD_MS) {
    emitRow(nowMs);
    windowStartMs = nowMs;
    resetWindow();
  } else if (!txBusy() && static_cast<uint32_t>(nowMs - lastHeaderMs) >= HEADER_EVERY_MS) {
    lastHeaderMs = nowMs;
    queueText(String(HEADER));
  }
}
