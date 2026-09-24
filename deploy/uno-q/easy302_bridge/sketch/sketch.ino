#include <Arduino.h>
#include <Arduino_RouterBridge.h>

// Minimal read-only Modbus RTU bridge for UNO Q + UART/RS485 converter.
// UART: Serial1 (D0/RX, D1/TX). MAX485 DE and /RE are tied to D2.
// Only function codes 03 and 04 exist in this firmware. There is no write surface.
//
// Timing (Modbus over Serial Line V1.02, section 2.5.1.1):
//   * character time = 11 bits / baud (start + 8 data + parity-or-2nd-stop + stop)
//   * t3.5 frame gap = 3.5 characters, fixed at 1750 us above 19200 baud
//   * the probe response timeout scales with baud: slave turnaround + time on the wire
//
// RPCs:
//   easy302/probe  (baud, framing, slave, table, address, count) -> "OK,n,w1,..." | "ERR,..."
//                  commissioning-only FC03/FC04 read; never while the HMI is polling.
//   easy302/sniff  (baud, framing, durationMs) -> "HEX,..,|,..,COUNT,n"   (blocking capture)
//   easy302/listen (baud, framing)             -> "OK"  start continuous passive capture
//   easy302/drain  ()                          -> "HEX,..,|,..,COUNT,n,OVF,k"
//                  bytes captured since the last drain; "|" marks a >= t3.5 silence
//                  (frame boundary). Continuous capture has no blind window between RPCs.

constexpr int RS485_DIR_PIN = D2;
constexpr size_t MAX_RESPONSE = 87;
constexpr int MAX_SNIFF_BYTES = 512;
constexpr unsigned long SLAVE_TURNAROUND_MS = 100;  // typical max slave processing time
constexpr size_t RING_SIZE = 1024;

uint16_t modbusCrc(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t pos = 0; pos < length; ++pos) {
    crc ^= data[pos];
    for (int bit = 0; bit < 8; ++bit) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
    }
  }
  return crc;
}

uint16_t serialConfig(int framing) {
  switch (framing) {
    case 1: return SERIAL_8E1;
    case 2: return SERIAL_8O1;
    case 3: return SERIAL_8N2;
    default: return SERIAL_8N1;
  }
}

unsigned long charTimeUs(long baud) { return (11UL * 1000000UL + baud - 1) / (unsigned long)baud; }

unsigned long t35Us(long baud) {
  if (baud > 19200) return 1750UL;
  return (35UL * 11UL * 1000000UL / 10UL + baud - 1) / (unsigned long)baud;
}

void setReceiveMode() { digitalWrite(RS485_DIR_PIN, LOW); }
void setTransmitMode() { digitalWrite(RS485_DIR_PIN, HIGH); }

// ------------------------------------------------------------------ continuous passive capture
struct Capture {
  bool active = false;
  long baud = 0;
  int framing = 0;
  uint8_t ring[RING_SIZE];
  bool gapBefore[RING_SIZE];
  size_t head = 0;
  size_t count = 0;
  unsigned long overflows = 0;
  unsigned long lastByteUs = 0;
  bool seenByte = false;
} capture;

void captureConfigure(long baud, int framing) {
  Serial1.end();
  Serial1.begin((unsigned long)baud, serialConfig(framing));
  while (Serial1.available()) Serial1.read();
  setReceiveMode();
}

void capturePoll() {
  if (!capture.active) return;
  const unsigned long gap = t35Us(capture.baud);
  while (Serial1.available()) {
    const uint8_t value = (uint8_t)Serial1.read();
    const unsigned long now = micros();
    const bool boundary = capture.seenByte && (now - capture.lastByteUs) >= gap;
    capture.lastByteUs = now;
    capture.seenByte = true;
    if (capture.count == RING_SIZE) {  // full: drop oldest, remember we lost data
      capture.head = (capture.head + 1) % RING_SIZE;
      --capture.count;
      ++capture.overflows;
    }
    const size_t idx = (capture.head + capture.count) % RING_SIZE;
    capture.ring[idx] = value;
    capture.gapBefore[idx] = boundary;
    ++capture.count;
  }
}

String listenBus(int baud, int framing) {
  if (baud < 1200 || baud > 115200) return "ERR,invalid_arguments";
  capture.baud = baud;
  capture.framing = framing;
  capture.head = capture.count = 0;
  capture.overflows = 0;
  capture.seenByte = false;
  captureConfigure(baud, framing);
  capture.active = true;
  return "OK";
}

String drainCapture() {
  capturePoll();
  static const char digits[] = "0123456789ABCDEF";
  String result = "HEX";
  size_t n = capture.count;
  for (size_t i = 0; i < n; ++i) {
    const size_t idx = (capture.head + i) % RING_SIZE;
    if (capture.gapBefore[idx] && i > 0) result += ",|";
    result += ',';
    result += digits[capture.ring[idx] >> 4];
    result += digits[capture.ring[idx] & 0x0F];
  }
  capture.head = (capture.head + n) % RING_SIZE;
  capture.count = 0;
  result += String(",COUNT,") + (unsigned long)n + String(",OVF,") + capture.overflows;
  capture.overflows = 0;
  return result;
}

// ------------------------------------------------------------------ commissioning probe
String probeRegisters(int baud, int framing, int slaveId, int table, int address, int count) {
  if (baud < 1200 || baud > 115200 || slaveId < 1 || slaveId > 247 ||
      address < 0 || address > 65535 || count < 1 || count > 41 ||
      (table != 3 && table != 4)) {
    return "ERR,invalid_arguments";
  }

  const bool resumeCapture = capture.active;
  capture.active = false;
  Serial1.end();
  Serial1.begin((unsigned long)baud, serialConfig(framing));
  while (Serial1.available()) Serial1.read();

  uint8_t request[8] = {
    (uint8_t)slaveId, (uint8_t)table,
    (uint8_t)(address >> 8), (uint8_t)(address & 0xFF),
    (uint8_t)(count >> 8), (uint8_t)(count & 0xFF), 0, 0
  };
  const uint16_t requestCrc = modbusCrc(request, 6);
  request[6] = requestCrc & 0xFF;
  request[7] = requestCrc >> 8;

  const unsigned long charUs = charTimeUs(baud);
  const unsigned long gapUs = t35Us(baud);
  const size_t expected = 5 + (size_t)count * 2;
  // Turnaround + request + response on the wire, with 50 % margin for inter-char gaps.
  const unsigned long timeoutUs =
      SLAVE_TURNAROUND_MS * 1000UL + (sizeof(request) + expected) * charUs * 3UL / 2UL;

  delayMicroseconds(gapUs);  // guarantee t3.5 bus silence before our frame
  setTransmitMode();
  Serial1.write(request, sizeof(request));
  Serial1.flush();  // wait until the last stop bit is out
  setReceiveMode();

  uint8_t response[MAX_RESPONSE];
  size_t received = 0;
  const unsigned long start = micros();
  unsigned long lastByte = start;
  while (received < expected) {
    const unsigned long now = micros();
    if (Serial1.available()) {
      if (received < MAX_RESPONSE) response[received++] = (uint8_t)Serial1.read();
      else Serial1.read();
      lastByte = now;
      if (received >= 5 && (response[1] & 0x80)) break;  // exception frame is 5 bytes
      continue;
    }
    if (received > 0 && now - lastByte >= gapUs) break;  // t3.5 silence: frame ended
    if (now - start >= timeoutUs) break;
  }

  String result;
  if (received < 5) {
    result = String("ERR,timeout,") + (unsigned long)received;
  } else if (response[0] != slaveId) {
    result = "ERR,slave_mismatch";
  } else if (response[1] & 0x80) {
    const uint16_t crc = modbusCrc(response, 3);
    result = (crc == (uint16_t)(response[3] | (response[4] << 8))) ? String("ERR,exception,") + response[2] : String("ERR,crc");
  } else if (response[1] != table) {
    result = "ERR,function_mismatch";
  } else if (response[2] != count * 2 || received < expected) {
    result = "ERR,length_mismatch";
  } else {
    const uint16_t actualCrc = modbusCrc(response, expected - 2);
    const uint16_t wireCrc = response[expected - 2] | ((uint16_t)response[expected - 1] << 8);
    if (actualCrc != wireCrc) {
      result = "ERR,crc";
    } else {
      result = String("OK,") + count;
      for (int index = 0; index < count; ++index) {
        const int offset = 3 + index * 2;
        const uint16_t word = ((uint16_t)response[offset] << 8) | response[offset + 1];
        result += ',';
        result += String(word);
      }
    }
  }
  if (resumeCapture) {
    captureConfigure(capture.baud, capture.framing);
    capture.seenByte = false;
    capture.active = true;
  }
  return result;
}

// ------------------------------------------------------------------ bounded blocking sniff
String sniffBus(int baud, int framing, int durationMs) {
  if (baud < 1200 || baud > 115200 || durationMs < 50 || durationMs > 5000) {
    return "ERR,invalid_arguments";
  }
  const bool resumeCapture = capture.active;
  capture.active = false;
  captureConfigure(baud, framing);

  const unsigned long gapUs = t35Us(baud);
  static const char digits[] = "0123456789ABCDEF";
  String result = "HEX";
  int received = 0;
  bool seen = false;
  unsigned long lastByte = 0;
  const unsigned long start = millis();
  while (millis() - start < (unsigned long)durationMs && received < MAX_SNIFF_BYTES) {
    if (!Serial1.available()) continue;  // tight poll: no delay(), so gaps are measurable
    const uint8_t value = (uint8_t)Serial1.read();
    const unsigned long now = micros();
    if (seen && now - lastByte >= gapUs) result += ",|";
    seen = true;
    lastByte = now;
    result += ',';
    result += digits[value >> 4];
    result += digits[value & 0x0F];
    ++received;
  }
  if (resumeCapture) {
    captureConfigure(capture.baud, capture.framing);
    capture.seenByte = false;
    capture.active = true;
  }
  return result + String(",COUNT,") + received;
}

void setup() {
  pinMode(RS485_DIR_PIN, OUTPUT);
  setReceiveMode();
  Bridge.begin();
  Bridge.provide_safe("easy302/probe", probeRegisters);
  Bridge.provide_safe("easy302/sniff", sniffBus);
  Bridge.provide_safe("easy302/listen", listenBus);
  Bridge.provide_safe("easy302/drain", drainCapture);
}

void loop() {
  capturePoll();  // must run often: 1 KiB ring = ~270 ms of a saturated 38400-baud bus
}
