interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  rounded = false,
  className = "",
}: SkeletonProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <div
      className={`pl-skeleton ${rounded ? "pl-skeleton--rounded" : ""} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}