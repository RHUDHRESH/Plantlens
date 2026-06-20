import { useMemo } from "react";

const SCRIPT_PATTERN = /<script\b/i;
const EXTERNAL_HREF_PATTERN = /href\s*=\s*["']https?:\/\//i;

export function isSafeInlineSvg(svg: string): boolean {
  if (!svg || !svg.includes("viewBox")) return false;
  if (SCRIPT_PATTERN.test(svg)) return false;
  if (EXTERNAL_HREF_PATTERN.test(svg)) return false;
  return true;
}

interface ComponentIconProps {
  svg?: string | undefined;
  label: string;
  accentRole?: string | undefined;
  size?: number | undefined;
}

export function ComponentIcon({ svg, label, accentRole = "power", size = 48 }: ComponentIconProps) {
  const safe = useMemo(() => (svg ? isSafeInlineSvg(svg) : false), [svg]);

  if (!safe || !svg) {
    return (
      <div
        className={`component-icon component-icon--fallback component-icon--${accentRole}`}
        style={{ width: size, height: size }}
        aria-label={label}
        title={label}
      >
        <span>{label.slice(0, 2).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div
      className={`component-icon component-icon--${accentRole}`}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
      // Repo-owned SVG validated at load time; no external href or script tags.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}