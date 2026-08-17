'use client';

import { useState } from 'react';
import type { PortfolioEtf } from '@/lib/optimizer/optimize';

function eur(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Liest einen Betrag aus dem Eingabefeld: leer → 0, ungültig → null. */
function parseEuro(raw: string): number | null {
  if (raw.trim() === '') return 0;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Inline editierbare Sparrate je Zeile (nachträglich änderbar). */
function MonthlyCell({
  etf,
  onCommit,
}: {
  etf: PortfolioEtf;
  onCommit: (isin: string, monthlyEur: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = etf.monthlyEur && etf.monthlyEur > 0 ? String(etf.monthlyEur) : '';
  const display = draft ?? current;

  const commit = () => {
    if (draft === null) return;
    const parsed = parseEuro(draft);
    setDraft(null);
    if (parsed === null || parsed < 0) return; // ungültig → Anzeige zurücksetzen
    onCommit(etf.isin, parsed > 0 ? parsed : undefined);
  };

  return (
    <input
      className="monthlyInput"
      type="text"
      inputMode="decimal"
      placeholder="—"
      value={display}
      aria-label={`Sparrate für ${etf.data.profile.name}`}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function PortfolioInput({
  portfolio,
  loading,
  hydrated,
  onAdd,
  onRemove,
  onMonthlyChange,
}: {
  portfolio: PortfolioEtf[];
  loading: boolean;
  hydrated: boolean;
  onAdd: (isin: string, amountEur: number, monthlyEur?: number) => void;
  onRemove: (isin: string) => void;
  onMonthlyChange: (isin: string, monthlyEur: number | undefined) => void;
}) {
  const [isin, setIsin] = useState('');
  const [amount, setAmount] = useState('');
  const [monthly, setMonthly] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isin.trim().length < 12) return;
    const amountEur = parseEuro(amount);
    const monthlyEur = parseEuro(monthly);
    if (amountEur === null || monthlyEur === null) return;
    if (amountEur < 0 || monthlyEur < 0) return;
    // Mindestens eines von beiden: Bestand oder Sparrate.
    if (amountEur <= 0 && monthlyEur <= 0) return;
    onAdd(isin.trim().toUpperCase(), amountEur, monthlyEur > 0 ? monthlyEur : undefined);
    setIsin('');
    setAmount('');
    setMonthly('');
  };

  const total = portfolio.reduce((a, x) => a + x.amountEur, 0);

  return (
    <section className="card">
      <form className="addForm" onSubmit={submit}>
        <input
          type="text"
          placeholder="ISIN (z.B. IE00B4L5Y983)"
          value={isin}
          onChange={e => setIsin(e.target.value)}
          disabled={hydrated && loading ? true : undefined}
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Wert in € (Bestand, optional)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          disabled={hydrated && loading ? true : undefined}
        />
        <input
          type="text"
          inputMode="decimal"
          placeholder="€/Monat (Sparplan, optional)"
          value={monthly}
          onChange={e => setMonthly(e.target.value)}
          disabled={hydrated && loading ? true : undefined}
        />
        <button type="submit" disabled={hydrated && loading ? true : undefined}>
          {hydrated && loading ? 'Lädt…' : 'ETF hinzufügen'}
        </button>
      </form>
      <p className="muted">
        Gib pro ETF optional einen Bestandswert (€) und/oder eine monatliche Sparrate (€/Monat)
        an — beides zusammen geht auch.
      </p>

      {portfolio.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>ETF</th>
              <th className="num">Wert</th>
              <th className="num">€/Monat</th>
              <th className="num">Anteil</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {portfolio.map(e => (
              <tr key={e.isin}>
                <td>
                  {e.data.profile.name}
                  <div className="isinSub">{e.isin}</div>
                </td>
                <td className="num">{eur(e.amountEur)}</td>
                <td className="num">
                  <MonthlyCell etf={e} onCommit={onMonthlyChange} />
                </td>
                <td className="num">{total > 0 ? `${((e.amountEur / total) * 100).toFixed(1)}%` : '—'}</td>
                <td className="num">
                  <button className="remove" onClick={() => onRemove(e.isin)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
