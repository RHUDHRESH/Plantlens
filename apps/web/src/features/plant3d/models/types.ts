export interface ModelProps {
  /** Equipment is running (e.g. lamp lit, drive display shows RUN). Never animated. */
  running?: boolean;
  /**
   * Status colour for indicator LEDs — ONLY set when the equipment is abnormal. Normal equipment
   * keeps its indicators dark/grey (ISA-101).
   */
  ledColor?: string | null;
  /** Equipment tag shown on the tag plate (e.g. "INV-102"). */
  label?: string;
}
