import type { HTMLAttributes, ReactNode } from "react";
import type { BottomSheetMode } from "../../design/types";

interface SheetProps extends HTMLAttributes<HTMLDivElement> {
  mode: BottomSheetMode;
  onModeChange?: (mode: BottomSheetMode) => void;
  showHandle?: boolean;
  children: ReactNode;
}

const modeClass: Record<BottomSheetMode, string> = {
  collapsed: "pl-sheet--collapsed",
  peek: "pl-sheet--peek",
  expanded: "pl-sheet--expanded",
};

export function Sheet({
  mode,
  onModeChange,
  showHandle = true,
  className = "",
  children,
  ...props
}: SheetProps) {
  const classes = ["pl-sheet", modeClass[mode], className].filter(Boolean).join(" ");

  const cycleMode = () => {
    if (!onModeChange) return;
    const order: BottomSheetMode[] = ["collapsed", "peek", "expanded"];
    const idx = order.indexOf(mode);
    onModeChange(order[(idx + 1) % order.length] ?? "peek");
  };

  return (
    <div className={classes} role="region" aria-label="Command sheet" {...props}>
      {showHandle && (
        <button
          type="button"
          className="pl-sheet__handle"
          onClick={cycleMode}
          aria-label={`Sheet ${mode}. Tap to change height.`}
        >
          <span className="pl-sheet__handle-bar" />
        </button>
      )}
      <div className="pl-sheet__content">{children}</div>
    </div>
  );
}