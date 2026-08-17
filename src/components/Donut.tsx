'use client';

const PALETTE = [
  '#4d6bdd',
  '#ff9b40',
  '#13cc89',
  '#ff6b4a',
  '#7f56d9',
  '#38bdf8',
  '#14b8a6',
  '#84cc16',
  '#64748b',
  '#f59e0b',
];

export interface DonutSegment {
  id: string;
  label: string;
  value: number; // 0..1
}

/** SVG-Donut mit Legende. Optional klickbar (onSelect). */
export function Donut({
  segments,
  selectedId,
  onSelect,
}: {
  segments: DonutSegment[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const r = 60;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;

  // Start-Offsets als reine Prefix-Summe (kein Mutieren im Render).
  const lengths = segments.map(seg => (seg.value / total) * circumference);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((s, v) => s + v, 0));

  const interactive = !!onSelect;
  const hasSelection = selectedId != null;

  return (
    <div className="donutWrap">
      <svg width={180} height={180} viewBox="0 0 180 180">
        <circle
          cx={90}
          cy={90}
          r={r}
          fill="none"
          stroke="#e8eaed"
          strokeWidth={22}
        />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circumference;
          const isSel = selectedId === seg.id;
          const opacity = !hasSelection || isSel ? 1 : 0.35;
          return (
            <circle
              key={seg.id}
              cx={90}
              cy={90}
              r={r}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={22}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offsets[i]}
              transform="rotate(-90 90 90)"
              strokeOpacity={opacity}
              style={{ transition: 'stroke-opacity 0.2s' }}
              className={interactive ? 'donutSlice' : undefined}
              data-selected={isSel ? 'true' : undefined}
              onClick={interactive ? () => onSelect?.(seg.id) : undefined}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={`${seg.label}: ${(seg.value * 100).toFixed(1)}%`}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(seg.id);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </svg>
      <ul className="donutLegend">
        {segments.map((seg, i) => {
          const isSel = selectedId === seg.id;
          return (
            <li
              key={seg.id}
              className={interactive ? 'donutLegendItem' : undefined}
              data-selected={isSel ? 'true' : undefined}
              onClick={interactive ? () => onSelect?.(seg.id) : undefined}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-pressed={isSel}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect?.(seg.id);
                      }
                    }
                  : undefined
              }
            >
              <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              {seg.label} <b>{(seg.value * 100).toFixed(1)}%</b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}