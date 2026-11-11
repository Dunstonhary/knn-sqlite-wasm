/** Small labelled button group. Shared so the dashboard's controls match. */
export function Segmented<T extends string | number>({
  label,
  title,
  value,
  options,
  onChange,
}: {
  label: string
  /** Native tooltip on the label, for a control whose name needs explaining. */
  title?: string
  value: T
  options: Array<[T, string]>
  onChange: (next: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground" title={title}>
        {label}
      </span>
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={String(key)}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={`min-w-[30px] rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${
              value === key
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
