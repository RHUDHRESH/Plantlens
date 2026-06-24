interface SheetHandleProps {
  onClick?: () => void;
  label?: string;
}

export function SheetHandle({
  onClick,
  label = "Drag handle — tap to change sheet height",
}: SheetHandleProps) {
  return (
    <button
      type="button"
      className="pl-sheet-handle"
      onClick={onClick}
      aria-label={label}
    >
      <span className="pl-sheet-handle__bar" />
    </button>
  );
}