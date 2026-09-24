/*
  PlantLens sensor sketch for a regular Arduino Uno (ATmega328P, 16 MHz) over USB.

  Read-only acquisition: reads A0..A5 and streams PL1 lines to the PlantLens gateway
  (apps/gateway, line mode). It never drives actuators.

  Wire format (see apps/gateway/README.md, "PL1 protocol"):
      #PLANTLENS READY v1 hz=20 keys=vib,current,voltage,temp,aux4,aux5
      PL1,<seq>,vib=1.234,current=0.512,voltage=4.998~B,...*HH\r\n
    - <seq>  +1 per line; gaps tell the gateway how many lines were lost.
    - ~B     marks a saturated ADC reading (raw 0..1 or 1022..1023) as BAD.
    - HH     CRC-8 (poly 0x07, init 0x00) over the bytes from 'P' up to, not including, '*'.
    - Lines starting with '#' are comments. The READY banner is re-sent every 10 s so a gateway
      that connects late (or after the auto-reset window) still sees it.

  Timing: 115200 baud (a 16 MHz Uno is within 2.1 % at 115200 and cannot do 921600 reliably).
  A worst-case line is ~116 bytes, so 50 Hz uses ~50 % of the link. The main loop never blocks:
  the line is copied into a buffer and fed to Serial only as far as Serial.availableForWrite()
  allows. If the previous line is still being sent when the next sample is due, the sample is
  skipped and counted in "drops" (reported every 5 s as a '#PLANTLENS STATS' comment).
*/

#include <Arduino.h>
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------- configuration
static const uint32_t BAUD = 115200;
static const uint8_t RATE_HZ_REQUESTED = 20;  // 10..50
static const uint8_t RATE_HZ = RATE_HZ_REQUESTED < 10 ? 10 : (RATE_HZ_REQUESTED > 50 ? 50 : RATE_HZ_REQUESTED);
static const uint16_t PERIOD_MS = 1000 / RATE_HZ;
static const float VREF = 5.0f;  // default AVcc reference on the Uno

// Key names sent on the wire; map them to tag ids with GATEWAY_LINE__COLUMN_MAP.
static const uint8_t CHANNELS = 6;
static const uint8_t PINS[CHANNELS] = {A0, A1, A2, A3, A4, A5};
static const char* const KEYS[CHANNELS] = {"vib", "current", "voltage", "temp", "aux4", "aux5"};

static const uint16_t BANNER_EVERY_MS = 10000;
static const uint16_t STATS_EVERY_MS = 5000;

// ---------------------------------------------------------------- state
static char txLine[160];
static uint8_t txLen = 0;
static uint8_t txPos = 0;
static uint32_t seqNo = 0;
static uint32_t drops = 0;
static uint32_t lastSampleMs = 0;
static uint32_t lastBannerMs = 0;
static uint32_t lastStatsMs = 0;

static uint8_t crc8(const char* data, uint8_t len) {
  uint8_t crc = 0;
  for (uint8_t i = 0; i < len; ++i) {
    crc ^= (uint8_t)data[i];
    for (uint8_t b = 0; b < 8; ++b) {
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
    }
  }
  return crc;
}

static bool txBusy() { return txPos < txLen; }

// Queue a complete line (must include "\r\n"). Returns false if the previous line is still sending.
static bool queueLine(const char* text, uint8_t len) {
  if (txBusy() || len > sizeof(txLine)) return false;
  memcpy(txLine, text, len);
  txLen = len;
  txPos = 0;
  return true;
}

// Push as many pending bytes as the UART TX ring buffer accepts right now. Never blocks.
static void pumpSerial() {
  if (!txBusy()) return;
  int room = Serial.availableForWrite();
  if (room <= 0) return;
  uint8_t n = (uint8_t)min((int)(txLen - txPos), room);
  Serial.write((const uint8_t*)txLine + txPos, n);
  txPos += n;
}

static void appendStr(char* buf, uint8_t& len, const char* s) {
  while (*s && len < 150) buf[len++] = *s++;
}

static void sendComment(const char* prefix, uint32_t a, uint32_t b) {
  char line[80];
  uint8_t len = 0;
  char num[12];
  appendStr(line, len, prefix);
  ultoa(a, num, 10);
  appendStr(line, len, num);
  if (b != 0xFFFFFFFFUL) {
    appendStr(line, len, " drops=");
    ultoa(b, num, 10);
    appendStr(line, len, num);
  }
  appendStr(line, len, "\r\n");
  queueLine(line, len);  // comments are best effort
}

static void sendBanner() {
  char line[100];
  uint8_t len = 0;
  char num[6];
  appendStr(line, len, "#PLANTLENS READY v1 hz=");
  utoa(RATE_HZ, num, 10);
  appendStr(line, len, num);
  appendStr(line, len, " keys=");
  for (uint8_t i = 0; i < CHANNELS; ++i) {
    if (i) appendStr(line, len, ",");
    appendStr(line, len, KEYS[i]);
  }
  appendStr(line, len, "\r\n");
  queueLine(line, len);
}

static void sampleAndQueue() {
  if (txBusy()) {  // previous line not fully handed to the UART: skip, never block
    ++drops;
    ++seqNo;  // the gateway sees the gap and counts it
    return;
  }
  char line[sizeof(txLine)];
  uint8_t len = 0;
  char num[16];
  appendStr(line, len, "PL1,");
  ultoa(seqNo++, num, 10);
  appendStr(line, len, num);
  for (uint8_t i = 0; i < CHANNELS; ++i) {
    const int raw = analogRead(PINS[i]);
    const float volts = raw * (VREF / 1023.0f);
    line[len++] = ',';
    appendStr(line, len, KEYS[i]);
    line[len++] = '=';
    dtostrf(volts, 0, 3, num);  // AVR printf has no %f
    appendStr(line, len, num);
    if (raw <= 1 || raw >= 1022) appendStr(line, len, "~B");  // clipped: not a trustworthy value
  }
  const uint8_t crc = crc8(line, len);
  static const char HEX_DIGITS[] = "0123456789ABCDEF";
  line[len++] = '*';
  line[len++] = HEX_DIGITS[crc >> 4];
  line[len++] = HEX_DIGITS[crc & 0x0F];
  line[len++] = '\r';
  line[len++] = '\n';
  queueLine(line, len);
}

void setup() {
  Serial.begin(BAUD);
  // Bootloader noise may precede this; the gateway (reset policy wait_for_reset) discards
  // everything until it sees the banner.
  sendBanner();
  lastSampleMs = lastBannerMs = lastStatsMs = millis();
}

void loop() {
  pumpSerial();
  const uint32_t now = millis();
  if ((uint32_t)(now - lastSampleMs) >= PERIOD_MS) {
    lastSampleMs += PERIOD_MS;
    if ((uint32_t)(now - lastSampleMs) >= PERIOD_MS) lastSampleMs = now;  // fell behind: resync, no burst
    sampleAndQueue();
  } else if (!txBusy() && (uint32_t)(now - lastBannerMs) >= BANNER_EVERY_MS) {
    lastBannerMs = now;
    sendBanner();
  } else if (!txBusy() && (uint32_t)(now - lastStatsMs) >= STATS_EVERY_MS) {
    lastStatsMs = now;
    sendComment("#PLANTLENS STATS seq=", seqNo, drops);
  }
}
