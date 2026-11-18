import fs from 'fs';
import pg from 'pg';

const registry = JSON.parse(fs.readFileSync('src/lib/languages.json', 'utf8')).languages;
const byAlias = new Map();
const byName = new Map();
for (const entry of registry) {
  byName.set(entry.name.toLowerCase(), entry);
  byAlias.set(entry.name.toLowerCase(), entry);
  for (const a of entry.aliases) byAlias.set(a.toLowerCase(), entry);
}

function normalizeOne(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (byAlias.has(v)) return byAlias.get(v).name;
  const hits = registry.filter((e) => [e.name, ...e.aliases].some((a) => v.includes(a.toLowerCase())));
  const specific = hits.find((e) => !e.generic) ?? hits[0];
  return specific?.name ?? null;
}

function normalizeClinicLanguages(rawList) {
  const out = [];
  for (const item of Array.isArray(rawList) ? rawList : []) {
    for (const piece of String(item || '').split(/[,/;&]|\band\b/i)) {
      const name = normalizeOne(piece);
      if (name && !out.includes(name)) out.push(name);
    }
  }
  // Ensure umbrella family name (e.g. "Chinese") is also present whenever a variant (Mandarin/Cantonese) is present,
  // while keeping the specific variants intact so detail pages still show "Mandarin, Cantonese".
  for (const name of [...out]) {
    const entry = byName.get(name.toLowerCase());
    if (entry && entry.family && entry.family !== entry.name && !out.includes(entry.family)) {
      out.push(entry.family);
    }
  }
  return out.length ? out : ['English'];
}

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub';
const pool = new pg.Pool({ connectionString: dbUrl });

const { rows } = await pool.query('SELECT id, slug, languages FROM clinics');
let updated = 0;
for (const r of rows) {
  const next = normalizeClinicLanguages(r.languages);
  const prev = Array.isArray(r.languages) ? r.languages : [];
  if (JSON.stringify(next) !== JSON.stringify(prev)) {
    await pool.query('UPDATE clinics SET languages = $1 WHERE id = $2', [next, r.id]);
    updated++;
  }
}
console.log(`[+] Normalized languages across ${rows.length} clinics (${updated} rows updated).`);
await pool.end();
