'use client';

import { SimpleTooltip } from '@/components/SimpleTooltip';

function colorFor(score: number): string {
  const pct = score * 100;
  if (pct >= 90) return '#13cc89';
  if (pct >= 70) return '#ff9b40';
  return '#ff6b4a';
}

export function CoverageGauge({
  score,
  label = 'Deckungs-Score',
  tooltipText = 'Wie gut dein Portfolio den Weltmarkt nachbildet. 100 % = exakt der Weltmarkt. Je niedriger, desto weiter bist du vom Weltmarkt entfernt.',
}: {
  score: number;
  label?: string;
  tooltipText?: string;
}) {
  const clamped = Math.max(0, Math.min(1, score));
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * clamped;
  const color = colorFor(clamped);

  return (
    <div className="gauge">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={r} fill="none" stroke="#e8eaed" strokeWidth={16} />
        <circle
          cx={80}
          cy={80}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
        />
        <text
          x={80}
          y={80}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={30}
          fontWeight={700}
          fill="#15284b"
        >
          {(clamped * 100).toFixed(1)}%
        </text>
      </svg>
      <div className="gaugeLabel">
        {label}
        <SimpleTooltip text={tooltipText} />
      </div>
    </div>
  );
}
