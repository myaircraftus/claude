interface MaConfidenceBarProps {
  level: 'high' | 'medium' | 'low' | 'insufficient'
  showLabel?: boolean
}

const levels = ['insufficient', 'low', 'medium', 'high']
const colors: Record<string, string> = {
  high: '#10B981', medium: '#F59E0B', low: '#F97316', insufficient: '#EF4444'
}
const labels: Record<string, string> = {
  high: 'High Confidence', medium: 'Medium Confidence', low: 'Low Confidence', insufficient: 'Insufficient Evidence'
}

export function MaConfidenceBar({ level, showLabel = true }: MaConfidenceBarProps) {
  const active = levels.indexOf(level)
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {levels.map((l, i) => (
          <div
            key={l}
            style={{
              width: 10, height: i <= active ? 10 + i * 2 : 6,
              borderRadius: 2,
              background: i <= active ? colors[level] : '#E2E8F0',
              transition: 'all 200ms ease',
            }}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-[12px] font-medium" style={{ color: colors[level] }}>
          {labels[level]}
        </span>
      )}
    </div>
  )
}
