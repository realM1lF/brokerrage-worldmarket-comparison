'use client';

import { useState } from 'react';
import type { Depot } from '@/lib/db/types';

export function DepotSwitcher({
  depots,
  activeId,
  loading,
  hydrated,
  onSwitch,
  onCreate,
  onDelete,
}: {
  depots: Depot[];
  activeId: number | null;
  loading: boolean;
  hydrated: boolean;
  onSwitch: (id: number) => void;
  onCreate: (name: string) => void;
  onDelete: () => void;
}) {
  const [newName, setNewName] = useState('');

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
  };

  return (
    <section className="card">
      <div className="depotRow">
        <label htmlFor="depot-select">Depot</label>
        <select
          id="depot-select"
          value={activeId ?? ''}
          disabled={hydrated && (loading || depots.length === 0) ? true : undefined}
          onChange={e => onSwitch(Number(e.target.value))}
        >
          {depots.map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Neues Depot"
          value={newName}
          disabled={hydrated && loading ? true : undefined}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create();
            }
          }}
        />
        <button type="button" disabled={hydrated && (loading || !newName.trim()) ? true : undefined} onClick={create}>
          Anlegen
        </button>
        <button type="button" disabled={hydrated && (loading || depots.length <= 1) ? true : undefined} onClick={onDelete}>
          Löschen
        </button>
      </div>
    </section>
  );
}
