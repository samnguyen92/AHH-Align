import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'generated-clinics', 'google-places');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [k, ...rest] = trimmed.split('=');
    env[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const envLocal = loadEnvFile(path.join(ROOT_DIR, '.env.local'));
const envOpenClaw = loadEnvFile(path.join(ROOT_DIR, 'openclaw', '.env'));
const OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY ||
  envOpenClaw.OPENROUTER_API_KEY ||
  envLocal.OPENROUTER_API_KEY;

function crawlWebsiteDeep(websiteUrl) {
  if (!websiteUrl) return { pages: [] };
  try {
    const cmd = `docker exec asian-health-hub-openclaw python /app/openclaw/scrape_deep_website.py "${websiteUrl}"`;
    const out = execSync(cmd, { timeout: 90000, encoding: 'utf-8', maxBuffer: 15 * 1024 * 1024 });
    const jsonStart = out.indexOf('{"domain":');
    if (jsonStart !== -1) {
      return JSON.parse(out.slice(jsonStart));
    }
  } catch (err) {
    console.error(`[!] Deep crawl error for ${websiteUrl}:`, err.message);
  }
  return { pages: [] };
}

async function extractWithOpenRouter(clinic, crawledData) {
  const meta = clinic.metadata || {};
  const pages = crawledData.pages || [];

  // Compile prioritized website snippets (pricing, faq, about, home)
  const compiledText = pages.map((p) => {
    return `=== PAGE: ${p.url} (Type: ${p.type}, Title: ${p.title}) ===\n${p.content.slice(0, 4500)}`;
  }).join('\n\n').slice(0, 22000);

  const prompt = `You are a medical directory data extraction specialist preparing verified data for the Asian Health Hub.
Extract and compile information for this clinic strictly adhering to the schema below.

Clinic Name: ${clinic.name}
Specialty: ${clinic.specialty || 'General Healthcare'}
Address: ${clinic.address}, ${clinic.city}, ${clinic.state}
Languages: ${(clinic.languages || []).join(', ')}

=== CRAWLED WEBSITE PAGES CONTENT ===
${compiledText}

STRICT EXTRACTION RULES:
1. PRICING:
   - Search the crawled text thoroughly for any explicit fees, consultation prices, service costs, or rates (e.g. from /pricing, /rates, /fees, or home page).
   - If genuine pricing is found, extract items into "pricing" array: [{ "name": "Item Name", "price": "$150", "price_range": null, "notes": "notes if any", "category": "Category" }].
   - If genuine starting prices are found, populate "pricing_summary": { "starting_price": "$100", "starting_unit": "per visit", "payment_methods": "Visa, MC, Cash", "accepts_hsa_fsa": true/false }.
   - IMPORTANT: If NO genuine prices are mentioned anywhere on the site, you MUST return "pricing": [] and "pricing_summary": null. DO NOT invent or guess any prices!
2. FAQ:
   - If genuine FAQs exist on the website, extract them faithfully into "faqs": [{ "question": "...", "answer": "..." }].
   - If the website does NOT have an FAQ section, generate 3 to 4 SAFE, accurate general FAQs covering: (1) Languages spoken and bilingual staff comfort, (2) Booking and scheduling process, (3) What to prepare for the first visit, (4) Insurance / superbill / payment methods.
   - Do NOT mention fake prices in FAQs.
3. NEXT HEALTH METADATA:
   - "what_to_know": 2-3 items with { "title": "...", "detail": "..." }
   - "differentiators": 2-3 items with { "title": "...", "detail": "..." }
   - "before_you_book": 2-3 items with { "title": "...", "detail": "..." }
   - "cultural_context": 1 paragraph on cultural and language competence in ${(clinic.languages || []).join(', ')}.
   - "services_offered": 3-6 items with { "name": "...", "category": "...", "description": "...", "is_featured": boolean }

Return ONLY valid JSON matching this structure:
{
  "pricing": [],
  "pricing_summary": null,
  "faqs": [],
  "what_to_know": [],
  "differentiators": [],
  "before_you_book": [],
  "cultural_context": "...",
  "services_offered": []
}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      console.error(`[!] OpenRouter error (${res.status}):`, await res.text());
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    console.error(`[!] LLM error for ${clinic.name}:`, err.message);
    return null;
  }
}

function calculateScore(m, photosCount) {
  let score = 0;
  if (photosCount >= 5) score += 20;
  else if (photosCount >= 3) score += 15;
  else if (photosCount >= 1) score += 10;

  if (m.what_to_know && m.what_to_know.length >= 2) score += 15;
  if (m.differentiators && m.differentiators.length >= 2) score += 15;
  if (m.before_you_book && m.before_you_book.length >= 2) score += 10;
  if (m.services_offered && m.services_offered.length >= 3) score += 10;
  if (m.cultural_context) score += 10;
  if (m.faqs && m.faqs.length >= 3) score += 10;
  if (m.pricing && m.pricing.length > 0) score += 10;

  return Math.min(100, score);
}

async function enrichClinic(pool, clinic) {
  console.log(`\n=====================================================`);
  console.log(`[*] Processing: ${clinic.name} (${clinic.city}, ${clinic.state})`);
  console.log(`=====================================================`);

  const meta = clinic.metadata || {};
  const website = meta.website || meta.source_url || meta.google_website_url;

  console.log(`   [*] Deep crawling website: ${website}...`);
  const crawlResult = crawlWebsiteDeep(website);
  console.log(`   [+] Pages crawled: ${crawlResult.pages?.length || 0}`);
  if (crawlResult.pages) {
    crawlResult.pages.forEach((p, idx) => {
      console.log(`       ${idx + 1}. [${p.type}] ${p.url} (${p.content.length} chars)`);
    });
  }

  console.log(`   [*] Extracting Pricing, FAQs, and NEXT HEALTH data via AI...`);
  const extracted = await extractWithOpenRouter(clinic, crawlResult);

  if (!extracted) {
    console.log(`   [-] Extraction failed, skipping update.`);
    return;
  }

  const newMeta = { ...meta };

  // 1. Pricing: if real pricing found, assign it; if empty array, set [] and null summary so section is hidden
  if (Array.isArray(extracted.pricing) && extracted.pricing.length > 0) {
    newMeta.pricing = extracted.pricing;
    newMeta.pricing_summary = extracted.pricing_summary || null;
    console.log(`   [+] Found ${extracted.pricing.length} PRICING ITEMS!`);
  } else {
    newMeta.pricing = [];
    newMeta.pricing_summary = null;
    console.log(`   [-] No public pricing found on site. Pricing section will be hidden.`);
  }

  // 2. FAQs:
  if (Array.isArray(extracted.faqs) && extracted.faqs.length > 0) {
    newMeta.faqs = extracted.faqs;
    console.log(`   [+] Added ${extracted.faqs.length} FAQs!`);
  }

  // 3. Metadata fields:
  if (extracted.what_to_know?.length) newMeta.what_to_know = extracted.what_to_know;
  if (extracted.differentiators?.length) newMeta.differentiators = extracted.differentiators;
  if (extracted.before_you_book?.length) newMeta.before_you_book = extracted.before_you_book;
  if (extracted.cultural_context) newMeta.cultural_context = extracted.cultural_context;
  if (extracted.services_offered?.length) newMeta.services_offered = extracted.services_offered;

  // 4. Image duplicate cleanup: remove remote URLs from gallery_images if images exists
  if (Array.isArray(newMeta.images) && newMeta.images.length > 0) {
    // Keep only local images
    newMeta.gallery_images = [];
  }

  // 5. Score & Status
  const photosCount = (newMeta.images || []).length;
  const score = calculateScore(newMeta, photosCount);
  newMeta.completeness_score = score;
  const status = score >= 70 ? 'published' : 'draft';

  console.log(`   [*] Score: ${score}/100 -> Status: ${status.toUpperCase()}`);

  await pool.query(
    `UPDATE clinics SET metadata = $1, status = $2 WHERE id = $3`,
    [JSON.stringify(newMeta), status, clinic.id]
  );
  console.log(`   [✓] Clinic updated in PostgreSQL!`);
}

async function main() {
  const args = process.argv.slice(2);
  const targetSlug = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
  const sampleCount = parseInt(args.find((a) => a.startsWith('--sample='))?.split('=')[1] || '0', 10);
  const isAll = args.includes('--all');

  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub',
  });

  try {
    if (targetSlug) {
      const { rows } = await pool.query(`SELECT * FROM clinics WHERE slug = $1`, [targetSlug]);
      if (rows.length === 0) {
        console.error(`Clinic not found with slug: ${targetSlug}`);
        process.exit(1);
      }
      await enrichClinic(pool, rows[0]);
    } else if (sampleCount > 0) {
      console.log(`[*] Running sample test on ${sampleCount} diverse clinics...`);
      const { rows } = await pool.query(`
        SELECT * FROM clinics
        WHERE languages && ARRAY['Vietnamese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']
        ORDER BY (metadata->>'rating')::numeric DESC NULLS LAST
        LIMIT $1
      `, [sampleCount]);
      for (const clinic of rows) {
        await enrichClinic(pool, clinic);
      }
    } else if (isAll) {
      console.log(`[*] Running on all top 100 clinics...`);
      const { rows } = await pool.query(`
        SELECT * FROM clinics
        WHERE languages && ARRAY['Vietnamese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']
        ORDER BY (metadata->>'rating')::numeric DESC NULLS LAST
        LIMIT 100
      `);
      for (let i = 0; i < rows.length; i++) {
        console.log(`\n[${i + 1}/${rows.length}]`);
        await enrichClinic(pool, rows[i]);
      }
    } else {
      console.log('Usage:');
      console.log('  node scripts/enrich_clinics_deep.mjs --slug=metro-acupuncture');
      console.log('  node scripts/enrich_clinics_deep.mjs --sample=10');
      console.log('  node scripts/enrich_clinics_deep.mjs --all');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
