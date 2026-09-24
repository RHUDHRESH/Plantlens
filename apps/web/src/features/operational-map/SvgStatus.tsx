import type { StatusKind } from "../../components/ui/primitives";

/** Shape-coded status glyph for SVG canvases (mirrors PriorityGlyph: ▲ ◆ ■ ● …). */
export function SvgGlyph({ status, x, y }: { status: StatusKind; x: number; y: number }) {
  const t = `translate(${x - 5},${y - 5}) scale(0.84)`;
  const cls = `pl-glyph pl-glyph--${status}`;
  switch (status) {
    case "critical":
      return <path transform={t} className={cls} d="M6 1 11 10.5H1Z" />;
    case "high":
      return <path transform={t} className={cls} d="M6 .8 11.2 6 6 11.2.8 6Z" />;
    case "medium":
      return <rect transform={t} className={cls} x="1.5" y="1.5" width="9" height="9" rx="1" />;
    case "sensor_bad":
      return <path transform={t} className={cls} d="M1.5 1.5h9v9h-9Z M3 9 9 3" fill="none" strokeWidth="1.6" />;
    case "offline":
      return <circle transform={t} className={cls} cx="6" cy="6" r="4.4" fill="none" strokeWidth="1.6" strokeDasharray="2 1.6" />;
    default:
      return <circle transform={t} className={cls} cx="6" cy="6" r="4.6" />;
  }
}

/** Status tag for SVG: glyph + uppercase text on a tinted pill (colour + shape + text). */
export function SvgStatusTag({
  status,
  label,
  x,
  y,
  anchor = "end",
}: {
  status: StatusKind;
  label: string;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
}) {
  const w = 24 + label.length * 6.6;
  const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return (
    <g className={`ops-svgtag ops-svgtag--${status}`} aria-hidden>
      <rect x={left} y={y - 9} width={w} height={18} rx={9} className="ops-svgtag__bg" />
      <SvgGlyph status={status} x={left + 11} y={y} />
      <text x={left + 19} y={y + 3.6} className="ops-svgtag__text">
        {label.toUpperCase()}
      </text>
    </g>
  );
}
