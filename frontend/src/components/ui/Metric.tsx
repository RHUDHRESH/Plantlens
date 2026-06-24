interface MetricProps {
  label: string;
  value: string | number;
  sublabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClass = {
  sm: "pl-metric--sm",
  md: "pl-metric--md",
  lg: "pl-metric--lg",
};

export function Metric({
  label,
  value,
  sublabel,
  size = "md",
  className = "",
}: MetricProps) {
  return (
    <div className={`pl-metric ${sizeClass[size]} ${className}`}>
      <span className="pl-metric__label">{label}</span>
      <span className="pl-metric__value">{value}</span>
      {sublabel && <span className="pl-metric__sublabel">{sublabel}</span>}
    </div>
  );
}