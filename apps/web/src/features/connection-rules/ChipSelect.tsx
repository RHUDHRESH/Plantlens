/** Multi-select as a row of toggle chips (no free text → no typos in rule conditions). */
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  empty = "Any",
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
  empty?: string;
}) {
  const set = new Set(value);
  return (
    <fieldset className="cr-chips" disabled={disabled}>
      <legend>
        {label}
        <span className="cr-chips__state">{value.length ? `${value.length} selected` : empty}</span>
      </legend>
      <div className="cr-chips__list">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="cr-chip"
            aria-pressed={set.has(o.value)}
            onClick={() => onChange(set.has(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
