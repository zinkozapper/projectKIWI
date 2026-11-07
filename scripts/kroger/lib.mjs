// Backfill-script glue. The pricing rules and the Kroger client live in the app
// (src/lib/food-import/pricing.ts, kroger.server.ts) so the add-food workflow and this script share one copy;
// Node runs those .ts files directly (type stripping, Node 22.18+). Rules: docs/kroger-price-selection-rules.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { krogerClient } from '../../src/lib/food-import/kroger.server.ts';

export { RULES, parsePackage, servingAmount, isOrganic, isStoreBrand, isGeneric, foodSpecs, foodRules, perServing, ineligible, rankCandidates } from '../../src/lib/food-import/pricing.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'data/kroger');

const kroger = krogerClient(() => {
  const id = process.env.KROGER_CLIENT_ID, secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in .env (free app at https://developer.kroger.com)');
  return { id, secret };
});
export const { nearestStore, alternateStores, searchProducts, priceFood } = kroger;

// ---------- CSV ----------
export const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
export const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0]);
}
export const readCsv = file => { const [h, ...rows] = parseCsv(fs.readFileSync(file, 'utf8')); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); };
