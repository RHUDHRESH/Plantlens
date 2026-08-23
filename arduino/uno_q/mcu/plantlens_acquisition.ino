/*
  PlantLens UNO Q MCU acquisition template.

  Adapt pin assignments, scaling, and sensor drivers to the exact hardware.
  The sketch deliberately does not control the motor. It samples sensing inputs,
  counts RPM pulses, emits quality-stamped rows, and drives a local alert output.
*/

constexpr uint8_t PIN_VIBRATION = A0;
constexpr uint8_t PIN_CURRENT = A1;
constexpr uint8_t PIN_VOLTAGE = A2;
constexpr uint8_t PIN_AIRFLOW = A3;
constexpr uint8_t PIN_RPM = 2;
constexpr uint8_t PIN_ALERT = LED_BUILTIN;

constexpr uint32_t SAMPLE_RATE_HZ = 800;
constexpr uint32_t SAMPLE_PERIOD_US = 1000000UL / SAMPLE_RATE_HZ;

volatile uint32_t rpmPulses = 0;
uint32_t sequenceNumber = 0;
uint32_t lastSampleUs = 0;

void onRpmPulse() { rpmPulses++; }

void setup() {
  Serial.begin(921600);
  pinMode(PIN_RPM, INPUT_PULLUP);
  pinMode(PIN_ALERT, OUTPUT);
  digitalWrite(PIN_ALERT, LOW);
  attachInterrupt(digitalPinToInterrupt(PIN_RPM), onRpmPulse, RISING);
  Serial.println("sequence,timestamp_us,vibration_raw,current_raw,voltage_raw,airflow_raw,rpm_pulses,quality");
}

void loop() {
  const uint32_t now = micros();
  if (static_cast<uint32_t>(now - lastSampleUs) < SAMPLE_PERIOD_US) return;
  lastSampleUs += SAMPLE_PERIOD_US;

  const int vibration = analogRead(PIN_VIBRATION);
  const int current = analogRead(PIN_CURRENT);
  const int voltage = analogRead(PIN_VOLTAGE);
  const int airflow = analogRead(PIN_AIRFLOW);

  noInterrupts();
  const uint32_t pulses = rpmPulses;
  rpmPulses = 0;
  interrupts();

  const bool saturated = vibration <= 1 || vibration >= 4094 || current <= 1 || current >= 4094;
  const char* quality = saturated ? "BAD" : "GOOD";

  Serial.print(sequenceNumber++);
  Serial.print(','); Serial.print(now);
  Serial.print(','); Serial.print(vibration);
  Serial.print(','); Serial.print(current);
  Serial.print(','); Serial.print(voltage);
  Serial.print(','); Serial.print(airflow);
  Serial.print(','); Serial.print(pulses);
  Serial.print(','); Serial.println(quality);
}
