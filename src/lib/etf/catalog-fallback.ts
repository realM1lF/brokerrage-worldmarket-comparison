import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EtfData } from './types';

/**
 * Optimizer-Fixtures als Fallback, wenn extraETF/Cache eine Katalog-ISIN
 * nicht liefern. Ohne das bleibt z.B. GDP-Weighted nach einem Katalog-Update
 * unsichtbar, bis der HTTP-Cache von /api/candidates abläuft.
 */
export function readCatalogFixture(isin: string): EtfData | null {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return null;
  const file = path.join(
    process.cwd(),
    'src/lib/optimizer/__fixtures__',
    `${isin}.json`,
  );
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8')) as EtfData;
    if (data?.profile?.isin !== isin) return null;
    if (!Array.isArray(data.exposures?.countries)) return null;
    return data;
  } catch {
    return null;
  }
}
