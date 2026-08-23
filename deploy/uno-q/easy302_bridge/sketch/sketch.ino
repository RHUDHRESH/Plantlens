#include <Arduino.h>
#include <Arduino_RouterBridge.h>

// Minimal read-only Modbus RTU bridge for UNO Q + UART/RS485 converter.
// UART: Serial1 (D0/RX, D1/TX). MAX485 DE and /RE are tied to D2.
// Only function codes 03 and 04 exist in this firmware.

constexpr int RS485_DIR_PIN = D2;
constexpr size_t MAX_RESPONSE = 87;
constexpr int MAX_SNIFF_BYTES = 512;

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

void setReceiveMode() {
  digitalWrite(RS485_DIR_PIN, LOW);
}

void setTransmitMode() {
  digitalWrite(RS485_DIR_PIN, HIGH);
}

String probeRegisters(int baud, int framing, int slaveId, int table, int address, int count) {
  if (baud < 1200 || baud > 115200 || slaveId < 1 || slaveId > 247 ||
      address < 0 || address > 65535 || count < 1 || count > 41 ||
      (table != 3 && table != 4)) {
    return "ERR,invalid_arguments";
  }

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

  setTransmitMode();
  delayMicroseconds(200);
  Serial1.write(request, sizeof(request));
  Serial1.flush();
  delayMicroseconds(200);
  setReceiveMode();

  uint8_t response[MAX_RESPONSE];
  size_t received = 0;
  const unsigned long start = millis();
  const size_t expected = 5 + (size_t)count * 2;
  while (millis() - start < 300 && received < expected) {
    while (Serial1.available() && received < MAX_RESPONSE) {
      response[received++] = (uint8_t)Serial1.read();
    }
    delay(1);
  }
  if (received < 5) return String("ERR,timeout,") + received;
  if (response[0] != slaveId) return "ERR,slave_mismatch";
  if (response[1] & 0x80) return String("ERR,exception,") + response[2];
  if (response[1] != table) return "ERR,function_mismatch";
  if (response[2] != count * 2 || received < expected) return "ERR,length_mismatch";
  const uint16_t actualCrc = modbusCrc(response, expected - 2);
  const uint16_t wireCrc = response[expected - 2] | ((uint16_t)response[expected - 1] << 8);
  if (actualCrc != wireCrc) return "ERR,crc";

  String result = String("OK,") + count;
  for (int index = 0; index < count; ++index) {
    const int offset = 3 + index * 2;
    const uint16_t word = ((uint16_t)response[offset] << 8) | response[offset + 1];
    result += ',';
    result += String(word);
  }
  return result;
}

String sniffBus(int baud, int framing, int durationMs) {
  if (baud < 1200 || baud > 115200 || durationMs < 50 || durationMs > 5000) {
    return "ERR,invalid_arguments";
  }
  Serial1.end();
  Serial1.begin((unsigned long)baud, serialConfig(framing));
  while (Serial1.available()) Serial1.read();
  setReceiveMode();

  String result = "HEX";
  int received = 0;
  const unsigned long start = millis();
  const char digits[] = "0123456789ABCDEF";
  while (millis() - start < (unsigned long)durationMs && received < MAX_SNIFF_BYTES) {
    while (Serial1.available() && received < MAX_SNIFF_BYTES) {
      const uint8_t value = (uint8_t)Serial1.read();
      result += ',';
      result += digits[value >> 4];
      result += digits[value & 0x0F];
      ++received;
    }
    delay(1);
  }
  return result + String(",COUNT,") + received;
}

void setup() {
  pinMode(RS485_DIR_PIN, OUTPUT);
  setReceiveMode();
  Bridge.begin();
  Bridge.provide_safe("easy302/probe", probeRegisters);
  Bridge.provide_safe("easy302/sniff", sniffBus);
}

void loop() {
  delay(5);
}
