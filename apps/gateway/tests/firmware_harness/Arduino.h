// Minimal host-side Arduino stub so the PlantLens sketches can be compiled with g++ and their
// serial output checked against the gateway parser (tests/test_firmware_output.py).
// Simulates time, a 64-byte UART TX ring buffer drained at the configured baud, and the ADC.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <algorithm>

using std::min;
using std::max;

enum { A0 = 14, A1, A2, A3, A4, A5 };
#define LED_BUILTIN 13
#define INPUT_PULLUP 2
#define OUTPUT 1
#define LOW 0
#define HIGH 1
#define RISING 3

extern uint64_t sim_us;
extern int sim_adc_override;  // -1: synthetic signal, otherwise constant raw value

inline uint32_t millis() { return (uint32_t)(sim_us / 1000); }
inline uint32_t micros() { return (uint32_t)sim_us; }
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int digitalPinToInterrupt(int p) { return p; }
inline void attachInterrupt(int, void (*)(), int) {}
inline void noInterrupts() {}
inline void interrupts() {}
inline int analogRead(int pin) {
  sim_us += 112;  // ~conversion time on an ATmega328P
  if (sim_adc_override >= 0) return sim_adc_override;
  double t = sim_us / 1e6;
  return (int)(512 + 300 * std::sin(2 * M_PI * (pin - A0 + 1) * t));
}

// Like avr-libc these write an unbounded C string; callers must size the buffer (as on AVR).
inline char* copy_out(char* out, const char* tmp) { std::memcpy(out, tmp, std::strlen(tmp) + 1); return out; }
inline char* dtostrf(double v, signed char width, unsigned char prec, char* out) {
  char tmp[64]; std::snprintf(tmp, sizeof tmp, "%*.*f", width, prec, v); return copy_out(out, tmp);
}
inline char* ultoa(unsigned long v, char* out, int) { char tmp[24]; std::snprintf(tmp, sizeof tmp, "%lu", v); return copy_out(out, tmp); }
inline char* utoa(unsigned v, char* out, int) { char tmp[24]; std::snprintf(tmp, sizeof tmp, "%u", v); return copy_out(out, tmp); }

class String {
 public:
  String() {}
  String(const char* s) : s_(s) {}
  String(const std::string& s) : s_(s) {}
  String(float v, int prec) { char b[32]; std::snprintf(b, sizeof b, "%.*f", prec, v); s_ = b; }
  String(double v, int prec) { char b[32]; std::snprintf(b, sizeof b, "%.*f", prec, v); s_ = b; }
  void reserve(size_t n) { s_.reserve(n); }
  size_t length() const { return s_.size(); }
  const char* c_str() const { return s_.c_str(); }
  String& operator+=(const String& o) { s_ += o.s_; return *this; }
  String& operator+=(const char* o) { s_ += o; return *this; }
  String& operator+=(char c) { s_ += c; return *this; }
  String& operator+=(int v) { s_ += std::to_string(v); return *this; }
  String& operator+=(unsigned v) { s_ += std::to_string(v); return *this; }
  String& operator+=(long v) { s_ += std::to_string(v); return *this; }
  String& operator+=(unsigned long v) { s_ += std::to_string(v); return *this; }
  friend String operator+(String a, const String& b) { a += b; return a; }
  friend String operator+(String a, int b) { a += b; return a; }
  friend String operator+(String a, const char* b) { a += b; return a; }

 private:
  std::string s_;
};

class SimSerial {
 public:
  void begin(unsigned long baud) { baud_ = baud; }
  int availableForWrite() { drain(); return 63 - (int)queued_; }
  size_t write(const uint8_t* data, size_t n) {
    drain();
    for (size_t i = 0; i < n; ++i) {
      while (queued_ >= 63) { sim_us += 10; drain(); ++blocked_; }  // real Serial blocks here
      std::fputc(data[i], stdout);
      ++queued_;
    }
    return n;
  }
  void drain() {
    if (!baud_) return;
    double sent = (sim_us - last_us_) * (baud_ / 10.0) / 1e6;
    size_t whole = (size_t)sent;
    if (whole) {
      queued_ = queued_ > whole ? queued_ - whole : 0;
      last_us_ = sim_us;
    }
  }
  unsigned long blocked_ = 0;

 private:
  unsigned long baud_ = 0;
  size_t queued_ = 0;
  uint64_t last_us_ = 0;
};

extern SimSerial Serial;
