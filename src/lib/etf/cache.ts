import { getStore } from '@netlify/blobs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EtfData } from './types';

/**
 * Cache-Abstraktion: Netlify Blobs in Prod, lokales Dateisystem in Dev.
 * Cache-Fehler sind nie fatal; bei Problemen wird live geladen.
 */

const DEFAULT_TTL_HOURS = 24 * 7;
const CACHE_DIR = path.join(process.cwd(), '.cache', 'etf');

export interface CacheEntry<T> {
  storedAt: number;
  data: T;
}

interface CacheBackend {
  get(key: string): Promise<CacheEntry<EtfData> | null>;
  set(key: string, entry: CacheEntry<EtfData>): Promise<void>;
}

function ttlMs(): number {
  const hours = Number(process.env.ETF_CACHE_TTL_HOURS);
  const effective = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS;
  return effective * 3_600_000;
}

/* -------- Netlify Blobs Backend -------- */

const netlifyBackend: CacheBackend = {
  async get(key) {
    try {
      const result = await getStore('etf-data').getWithMetadata(key, {
        type: 'json',
      } as { type: 'json' });
      if (!result) return null;
      const { data, metadata } = result;
      if (!data || !metadata) return null;
      const storedAt = Number((metadata as Record<string, unknown>).storedAt);
      if (!Number.isFinite(storedAt)) return null;
      if (Date.now() - storedAt > ttlMs()) return null;
      return { storedAt, data: data as EtfData };
    } catch (err) {
      console.warn(`Netlify-Blobs-Cache-Lesen (${key}) fehlgeschlagen:`, err);
      return null;
    }
  },
  async set(key, entry) {
    try {
      await getStore('etf-data').setJSON(key, entry.data, {
        metadata: { storedAt: String(entry.storedAt) },
      });
    } catch (err) {
      console.warn('Netlify-Blobs-Cache-Schreiben fehlgeschlagen:', err);
    }
  },
};

/* -------- Lokaler Datei-Cache (Dev) -------- */

const fileBackend: CacheBackend = {
  async get(key) {
    try {
      const file = path.join(CACHE_DIR, `${sanitize(key)}.json`);
      const raw = await fs.readFile(file, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<EtfData>;
      if (typeof entry?.storedAt !== 'number' || !entry?.data) return null;
      if (Date.now() - entry.storedAt > ttlMs()) return null;
      return entry;
    } catch {
      return null;
    }
  },
  async set(key, entry) {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const file = path.join(CACHE_DIR, `${sanitize(key)}.json`);
      await fs.writeFile(file, JSON.stringify(entry));
    } catch (err) {
      console.warn('Datei-Cache-Schreiben fehlgeschlagen:', err);
    }
  },
};

function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_');
}

/* -------- Automatische Backend-Auswahl -------- */

function isNetlify(): boolean {
  return !!(
    process.env.NETLIFY_BLOBS_CONTEXT ||
    (process.env.NETLIFY && process.env.NETLIFY_SITE_ID)
  );
}

const backend: CacheBackend = isNetlify() ? netlifyBackend : fileBackend;

export async function cacheGet(key: string): Promise<CacheEntry<EtfData> | null> {
  return backend.get(key);
}

export async function cacheSet(key: string, data: EtfData): Promise<void> {
  const entry: CacheEntry<EtfData> = { storedAt: Date.now(), data };
  await backend.set(key, entry);
}