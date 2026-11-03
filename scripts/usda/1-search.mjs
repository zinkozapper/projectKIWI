// Step 1: search FDC for each food and write data/usda/candidates.csv for review.
// The best candidate per food/role is pre-marked "x" in the `selected` column — change marks as needed, then run step 2.
//   --reselect  re-apply selection rules to the existing candidates.csv without calling the API
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, DEFAULT_TYPES, OUT, search, mapNutrients, toCsv, parseCsv } from './lib.mjs';

const TYPE_RANK = { 'Survey (FNDDS)': 0, Foundation: 1, 'SR Legacy': 2, Branded: 3 };
const FILE = path.join(OUT, 'candidates.csv');
const RESCALE = (CONFIG.rescaleExisting?.items || []).filter(i => i.query);
const jobs = [
  ...CONFIG.foods.flatMap(f => [['nutrients', f.query, f], ...(CONFIG.groups[f.group].mode === 'prepared' ? [['raw_reference', f.rawQuery, f]] : [])]),
  ...RESCALE.map(i => ['portion', i.query, i]),
];

// Rules (docs/usda-record-selection-rules.md §1): description filter first, then most nutrients, then dataset order, then search rank.
function eligible(food, role, desc) {
  const d = desc.toLowerCase();
  const raw = role === 'raw_reference';
  const must = (raw ? food.rawMust : food.must) || [];
  const exclude = [...((raw ? food.rawExclude : food.exclude) || []),
    ...(role === 'nutrients' && CONFIG.groups[food.group]?.mode === 'prepared' ? CONFIG.excludePrepared : [])];
  return must.every(t => d.includes(t.toLowerCase())) && !exclude.some(t => d.includes(t.toLowerCase()));
}
function pick(food, role, cands) { // cands: {rank, description, dataType, coverage, kcal}
  const ok = cands.filter(c => c.kcal != null && eligible(food, role, c.description));
  const RAW_RANK = { 'SR Legacy': 0, Foundation: 1 }; // SR Legacy carries household portion weights (cup, tbsp)
  // portion records (existing rows): only gram weights are used -> dataset order, then search order
  const PORTION_RANK = { 'SR Legacy': 0, 'Survey (FNDDS)': 1, Foundation: 2 }; // Foundation portions are usually just RACC
  if (role === 'portion') return ok.sort((a, b) => PORTION_RANK[a.dataType] - PORTION_RANK[b.dataType] || a.rank - b.rank)[0];
  return ok.sort((a, b) => role === 'raw_reference' ? (RAW_RANK[a.dataType] ?? 9) - (RAW_RANK[b.dataType] ?? 9) || a.rank - b.rank
    : b.coverage - a.coverage || TYPE_RANK[a.dataType] - TYPE_RANK[b.dataType] || a.rank - b.rank)[0];
}

const header = ['food', 'role', 'selected', 'fdc_id', 'data_type', 'description', 'brand', 'coverage_of_27', 'kcal_per_100g'];
const out = [header];
const report = (food, role, best, n) => console.log(`${food.name} [${role}] ${n} hits -> ${best ? `${best.fdcId} ${best.description} (${best.coverage}/27)` : 'NONE — pick manually'}`);

if (process.argv.includes('--reselect')) {
  const [h, ...rows] = parseCsv(fs.readFileSync(FILE, 'utf8')).filter(r => r.length > 1);
  const i = Object.fromEntries(h.map((k, j) => [k, j]));
  for (const [role, , food] of jobs) {
    const group = rows.filter(r => r[i.food] === food.name && r[i.role] === role);
    if (!group.length) continue;
    const cands = group.map((r, rank) => ({ r, rank, fdcId: r[i.fdc_id], description: r[i.description], dataType: r[i.data_type], coverage: +r[i.coverage_of_27], kcal: r[i.kcal_per_100g] === '' ? null : +r[i.kcal_per_100g] }));
    const best = pick(food, role, cands);
    for (const c of cands) { c.r[i.selected] = c === best ? 'x' : ''; out.push(c.r); }
    report(food, role, best, cands.length);
  }
} else {
  for (const [role, query, food] of jobs) {
    {
      const types = role === 'raw_reference' ? ['Foundation', 'SR Legacy'] : (food.dataTypes || CONFIG.groups[food.group]?.dataTypes || DEFAULT_TYPES);
      const hits = await search(query, types, 15);
      const cands = hits.map((h, rank) => { const m = mapNutrients(h); return { h, rank, fdcId: h.fdcId, description: h.description, dataType: h.dataType, coverage: m.coverage, kcal: m.values.Calories }; });
      const best = pick(food, role, cands);
      for (const c of cands) out.push([food.name, role, c === best ? 'x' : '', c.fdcId, c.dataType, c.description, c.h.brandOwner || '', c.coverage, c.kcal?.toFixed(1)]);
      if (!hits.length) out.push([food.name, role, '', '', '', `NO RESULTS for "${query}"`, '', '', '']);
      report(food, role, best, hits.length);
    }
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(FILE, toCsv(out));
console.log(`\nWrote data/usda/candidates.csv — review the "selected" column (exactly one x per food/role), then run 2-build.mjs`);
