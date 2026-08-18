'use client';

import { useRef, useState } from 'react';
import type { Depot } from '@/lib/db/types';

export function DepotSwitcher({
  depots,
  activeId,
  loading,
  hydrated,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  depots: Depot[];
  activeId: number | null;
  loading: boolean;
  hydrated: boolean;
  onSwitch: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const escapeRef = useRef(false);

  const active = depots.find(d => d.id === activeId) ?? null;

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
  };

  const startRename = () => {
    if (!active || renaming) return;
    setRenameDraft(active.name);
    setRenaming(true);
  };

  const commitRename = () => {
    if (escapeRef.current) {
      escapeRef.current = false;
      setRenaming(false);
      return;
    }
    const name = renameDraft.trim();
    setRenaming(false);
    if (!name || !active || name === active.name) return;
    onRename(name);
  };

  return (
    <section className="card">
      <div className="depotRow">
        <label htmlFor="depot-select">Depot</label>
        {renaming && active ? (
          <input
            type="text"
            value={renameDraft}
            aria-label="Depotname"
            onChange={e => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                escapeRef.current = true;
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
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
        )}
        <button
          type="button"
          aria-label="Depot umbenennen"
          title="Depot umbenennen"
          disabled={hydrated && (loading || !active) ? true : undefined}
          onClick={startRename}
        >
          ✎
        </button>
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
