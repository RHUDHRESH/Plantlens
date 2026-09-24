// Runs a sketch (included via -DSKETCH="path") for SIM_SECONDS of simulated time.
// stdout: the bytes the sketch wrote to Serial. stderr: "blocked=<n>" (times Serial.write stalled).
#include "Arduino.h"

uint64_t sim_us = 0;
int sim_adc_override = -1;
SimSerial Serial;

#include SKETCH

int main(int argc, char** argv) {
  double seconds = argc > 1 ? std::atof(argv[1]) : 3.0;
  if (argc > 2) sim_adc_override = std::atoi(argv[2]);
  setup();
  const uint64_t end = (uint64_t)(seconds * 1e6);
  while (sim_us < end) {
    loop();
    sim_us += 20;  // loop overhead
  }
  std::fflush(stdout);
  std::fprintf(stderr, "blocked=%lu\n", Serial.blocked_);
  return 0;
}
