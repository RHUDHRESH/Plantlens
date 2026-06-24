import type { InputHTMLAttributes, KeyboardEvent } from "react";

interface CommandInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onSubmit?: () => void;
  readOnlyHint?: boolean;
  large?: boolean;
}

export function CommandInput({
  onSubmit,
  readOnlyHint = true,
  large = false,
  className = "",
  placeholder = "Command or query…",
  ...props
}: CommandInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
    props.onKeyDown?.(e);
  };

  return (
    <div className={`pl-command-input ${large ? "pl-command-input--large" : ""} ${className}`}>
      <input
        type="text"
        className="pl-command-input__field"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        {...props}
      />
      {readOnlyHint && (
        <span className="pl-command-input__hint" aria-hidden="true">
          Read-only
        </span>
      )}
    </div>
  );
}