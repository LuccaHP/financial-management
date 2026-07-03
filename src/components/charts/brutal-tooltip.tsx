import { formatCentavos } from '#/lib/money'

/** Tooltip Recharts no estilo do sistema: borda dura, sem raio, sem sombra suave. */
export function BrutalTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
  labelFormatter?: (label: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="border-2 border-line bg-surface px-3 py-2 shadow-brutal">
      {label !== undefined && (
        <p className="mb-1 text-[10px] font-bold tracking-wider uppercase">
          {labelFormatter ? labelFormatter(String(label)) : label}
        </p>
      )}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-1.5 font-money text-xs">
          <span
            className="inline-block size-2.5 border border-line"
            style={{ background: entry.color }}
          />
          {entry.name}:{' '}
          <strong>{formatCentavos(Number(entry.value ?? 0))}</strong>
        </p>
      ))}
    </div>
  )
}
