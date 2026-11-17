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
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || envOpenClaw.OPENROUTER_API_KEY || envLocal.OPENROUTER_API_KEY;
const TELEGRAM_TOKEN = envLocal.TELEGRAM_BOT_TOKEN || envOpenClaw.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHATS = (envLocal.TELEGRAM_ADMIN_CHAT_ID || envOpenClaw.TELEGRAM_ADMIN_CHAT_ID || '1510299715').split(',').map((s) => s.trim()).filter(Boolean);

function detectExtension(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return 'webp';
}

function isValidImage(buf) {
  if (!buf || buf.length < 4000) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;
  // GIF: GIF8
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  return false;
}

async function downloadPhoto(url, timeoutMs = 12000) {
  try {
    let fullUrl = url;
    if (fullUrl.startsWith('//')) fullUrl = `https:${fullUrl}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (isValidImage(buf)) return buf;
  } catch {
    // ignore
  }
  return null;
}

function scrapeGmapsPhotosViaDocker(placeId) {
  if (!placeId) return [];
  try {
    const cmd = `docker exec asian-health-hub-openclaw python /app/openclaw/scrape_gmaps_photos.py "${placeId}"`;
    const out = execSync(cmd, { timeout: 35000, encoding: 'utf-8' });
    const urls = JSON.parse(out.trim());
    return Array.isArray(urls) ? urls : [];
  } catch (err) {
    // console.error(`[!] Gmaps scrape failed for ${placeId}:`, err.message);
    return [];
  }
}

async function lookupNpi(name, city, state) {
  try {
    const cleanName = encodeURIComponent((name || '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).slice(0, 3).join(' '));
    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&city=${encodeURIComponent(city || '')}&state=${encodeURIComponent(state || '')}&organization_name=${cleanName}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results[0]) {
      const r = data.results[0];
      return {
        npi: r.number,
        name: r.basic.organization_name || `${r.basic.first_name || ''} ${r.basic.last_name || ''}`.trim(),
        authorized_official: r.basic.authorized_official_first_name ? `${r.basic.authorized_official_first_name} ${r.basic.authorized_official_last_name}` : null,
        credential: r.basic.credential || null,
        taxonomy: r.taxonomies?.[0]?.desc || null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function scrapeWebsiteText(websiteUrl) {
  if (!websiteUrl) return '';
  try {
    const res = await fetch(websiteUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    // Simple text extraction from body, stripping scripts and tags
    const clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.slice(0, 3000);
  } catch {
    return '';
  }
}

async function composeWithOpenRouter(clinic, npiData, websiteSnippet) {
  const meta = clinic.metadata || {};
  const prompt = `You are a medical directory editor preparing a verified profile for the Asian Health Hub according to our high-standard NEXT HEALTH schema.
Review the following clinic information:
Name: ${clinic.name}
Specialty: ${clinic.specialty || 'General Healthcare'}
Address: ${clinic.address}, ${clinic.city}, ${clinic.state} ${clinic.zip_code || ''}
Languages: ${(clinic.languages || []).join(', ')}
Rating: ${meta.rating || 5.0} (${meta.rating_count || 10} reviews)
Official Website: ${meta.website || ''}
NPI Data: ${JSON.stringify(npiData || {})}
Website Content Snippet: ${websiteSnippet.slice(0, 1500)}

Generate a JSON object conforming strictly to this format:
{
  "description": "Two comprehensive paragraphs separated by \\n\\n. Paragraph 1: clinic history, services, and culturally competent patient care in ${(clinic.languages || []).join(', ')}. Paragraph 2: appointment experience, bilingual coordination, patient comfort, and clinical focus.",
  "short_description": "A crisp, engaging 1-sentence summary (under 160 characters).",
  "what_to_know": [
    { "title": "Clear concise header", "detail": "Actionable detail for patients" },
    { "title": "Second header", "detail": "Clear practical instruction" }
  ],
  "differentiators": [
    { "title": "Bilingual Care Advantage", "detail": "Specific explanation of native language guidance and comfort" },
    { "title": "Personalized Care Model", "detail": "Patient-first clinical approach" }
  ],
  "before_you_book": [
    { "title": "Insurance & Payment", "detail": "Accepted coverage, co-pays or sliding-scale transparency" },
    { "title": "First Visit Preparation", "detail": "What documents, medical records, or preparation to bring" }
  ],
  "cultural_context": "One insightful paragraph explaining how this clinic supports Asian immigrant families, bilingual staff availability in ${(clinic.languages || []).join(', ')}, and clear explanations for multigenerational families.",
  "services_offered": [
    { "name": "Service Name", "category": "Category", "description": "1-2 sentence clinical explanation", "is_featured": true },
    { "name": "Second Service", "category": "Category", "description": "1-2 sentence clinical explanation", "is_featured": false }
  ],
  "insurance_accepted": ["Medicare", "Medicaid", "Blue Cross Blue Shield", "Aetna", "Cigna", "UnitedHealthcare", "Cash/Self-Pay"],
  "price_tier": "$$"
}
Return ONLY valid JSON. No markdown ticks, no preamble.`;

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
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[!] OpenRouter error (${res.status}):`, errText);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    console.error(`[!] LLM composition error for ${clinic.name}:`, err.message);
    return null;
  }
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_TOKEN || TELEGRAM_CHATS.length === 0) return;
  for (const chatId of TELEGRAM_CHATS) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
    } catch {
      // ignore
    }
  }
}

async function sendTelegramDraftAlert(clinicName, slug, score, photoCount, languages) {
  const text = `⚠️ *[Asian Health Hub] Clinic Marked as DRAFT*\n\n` +
    `🏥 *Clinic:* ${clinicName}\n` +
    `📊 *Completeness Score:* ${score}/100 (< 70)\n` +
    `📸 *Real Photos Saved:* ${photoCount} files\n` +
    `🗣 *Languages:* ${languages.join(', ')}\n\n` +
    `🔒 *Action:* Clinic is currently hidden from public directory search. You can review and approve it in the Admin Dashboard:\n` +
    `/clinics/${slug}`;
  await sendTelegramMessage(text);
}

function calculateScore(m, photosCount) {
  let score = 0;
  if (photosCount >= 5) score += 20;
  else if (photosCount >= 3) score += 15;
  else if (photosCount >= 1) score += 10;

  if (m.what_to_know && m.what_to_know.length >= 2) score += 20;
  if (m.differentiators && m.differentiators.length >= 2) score += 15;
  if (m.before_you_book && m.before_you_book.length >= 2) score += 10;
  if (m.services_offered && m.services_offered.length >= 3) score += 15;
  if (m.cultural_context) score += 10;
  if (m.insurance_accepted && m.insurance_accepted.length >= 1) score += 10;
  return Math.min(100, score);
}

async function main() {
  console.log('=====================================================');
  console.log('=== STARTING 100 ASIAN CLINICS NEXT HEALTH PIPELINE ===');
  console.log('=====================================================');

  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub',
  });

  const { rows: clinics } = await pool.query(`
    SELECT id, name, slug, address, city, state, zip_code, phone, languages, specialty, description, metadata
    FROM clinics
    WHERE languages && ARRAY['Vietnamese', 'Korean', 'Chinese', 'Mandarin', 'Cantonese']
    ORDER BY (metadata->>'rating')::numeric DESC NULLS LAST, (metadata->>'rating_count')::numeric DESC NULLS LAST
    LIMIT 100;
  `);

  console.log(`[*] Target list: ${clinics.length} priority Asian-language clinics.`);

  const seenCoverHashes = new Set();
  let publishedCount = 0;
  let draftCount = 0;

  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i];
    const slug = clinic.slug || `clinic-${i + 1}`;
    console.log(`\n[${i + 1}/${clinics.length}] Enriching: ${clinic.name} (${clinic.city}, ${clinic.state})`);

    // 1. Collect candidate photos from Google Maps (Playwright) + Website gallery
    const metadata = clinic.metadata || {};
    const candidateUrls = [];

    // 1A. Google Maps Photos via Playwright
    const placeId = metadata.google_place_id;
    if (placeId) {
      console.log(`   [*] Extracting Google Maps photos for place ID ${placeId}...`);
      const gPhotos = scrapeGmapsPhotosViaDocker(placeId);
      console.log(`   [+] Found ${gPhotos.length} Google Maps photos.`);
      candidateUrls.push(...gPhotos);
    }

    // 1B. Website Gallery Images
    const gallery = Array.isArray(metadata.gallery_images) ? metadata.gallery_images : [];
    for (const gUrl of gallery) {
      if (typeof gUrl === 'string' && gUrl.startsWith('http') && !gUrl.includes('logo') && !gUrl.includes('captcha')) {
        candidateUrls.push(gUrl);
      }
    }

    // 2. Download and save up to 10 distinct photos
    const savedPublicUrls = [];
    let pIdx = 1;

    for (const imgUrl of candidateUrls) {
      if (savedPublicUrls.length >= 10) break;
      const buf = await downloadPhoto(imgUrl);
      if (!buf) continue;

      const hash = crypto.createHash('md5').update(buf).digest('hex');

      // For cover photo (pIdx == 1), ensure uniqueness across all clinics
      if (pIdx === 1) {
        if (seenCoverHashes.has(hash)) {
          console.log(`   [-] Skipping cover photo duplicate for ${clinic.name}...`);
          continue;
        }
        seenCoverHashes.add(hash);
      }

      const ext = detectExtension(buf);
      const fileName = `${slug}-google-${pIdx}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, buf);
      savedPublicUrls.push(`/uploads/generated-clinics/google-places/${fileName}`);
      pIdx++;
    }

    console.log(`   [+] Successfully saved ${savedPublicUrls.length} real photos to disk.`);

    // 3. NPI Lookup
    console.log(`   [*] Looking up NPI Registry...`);
    const npiData = await lookupNpi(clinic.name, clinic.city, clinic.state);
    if (npiData) {
      console.log(`   [+] Found NPI ${npiData.npi} (${npiData.name || ''})`);
    }

    // 4. Scrape website snippet
    const websiteUrl = metadata.website || metadata.source_url;
    let webSnippet = '';
    if (websiteUrl) {
      console.log(`   [*] Crawling website ${websiteUrl}...`);
      webSnippet = await scrapeWebsiteText(websiteUrl);
    }

    // 5. OpenRouter AI Composition
    console.log(`   [*] Composing NEXT HEALTH standard metadata with OpenRouter AI...`);
    const aiData = await composeWithOpenRouter(clinic, npiData, webSnippet);

    const newMetadata = {
      ...metadata,
      images: savedPublicUrls.length > 0 ? savedPublicUrls : metadata.images,
      gallery_images: candidateUrls.slice(0, 15),
    };

    let newDescription = clinic.description;

    if (aiData) {
      if (aiData.description) newDescription = aiData.description;
      if (aiData.short_description) newMetadata.short_description = aiData.short_description;
      if (aiData.what_to_know) newMetadata.what_to_know = aiData.what_to_know;
      if (aiData.differentiators) newMetadata.differentiators = aiData.differentiators;
      if (aiData.before_you_book) newMetadata.before_you_book = aiData.before_you_book;
      if (aiData.cultural_context) newMetadata.cultural_context = aiData.cultural_context;
      if (aiData.services_offered) newMetadata.services_offered = aiData.services_offered;
      if (aiData.insurance_accepted) newMetadata.insurance_accepted = aiData.insurance_accepted;
      if (aiData.price_tier) newMetadata.price_tier = aiData.price_tier;
      if (npiData?.npi) newMetadata.npi_number = npiData.npi;
      console.log(`   [+] Applied NEXT HEALTH schema (what_to_know, differentiators, before_you_book).`);
    }

    // 6. Score & Status
    const score = calculateScore(newMetadata, savedPublicUrls.length);
    newMetadata.completeness_score = score;
    const status = score >= 70 ? 'published' : 'draft';

    if (status === 'published') publishedCount++;
    else draftCount++;

    console.log(`   [*] Quality Score: ${score}/100 -> Status: ${status.toUpperCase()}`);

    // 7. Update PostgreSQL
    await pool.query(
      `UPDATE clinics SET description = $1, metadata = $2, status = $3 WHERE id = $4`,
      [newDescription, JSON.stringify(newMetadata), status, clinic.id]
    );

    // 8. Telegram Notification
    if (status === 'draft') {
      await sendTelegramDraftAlert(clinic.name, slug, score, savedPublicUrls.length, clinic.languages || []);
    } else if ((i + 1) % 25 === 0) {
      await sendTelegramMessage(`🚀 *[Asian Health Hub Enrichment]* Progress: ${i + 1}/${clinics.length} clinics processed. (${publishedCount} published, ${draftCount} drafts).`);
    }
  }

  const finalMsg = `🎉 *[Asian Health Hub] 100 Asian Clinics Enrichment Complete!*\n\n` +
    `📊 *Total Processed:* ${clinics.length}\n` +
    `✅ *Published (Score >= 70):* ${publishedCount}\n` +
    `📝 *Drafts for Review (Score < 70):* ${draftCount}\n` +
    `📸 *Real Photos Saved:* ${fs.readdirSync(UPLOADS_DIR).length} files\n\n` +
    `👉 Directory and Clinic Profiles are now live with real Google Maps photos and NEXT HEALTH data schema!`;
  await sendTelegramMessage(finalMsg);

  console.log('\n=====================================================');
  console.log(`=== PIPELINE COMPLETED SUCCESSFULLY! ===`);
  console.log(`- Total Clinics Processed: ${clinics.length}`);
  console.log(`- Published (Score >= 70): ${publishedCount}`);
  console.log(`- Drafts (Score < 70): ${draftCount}`);
  console.log(`- Uploads directory file count: ${fs.readdirSync(UPLOADS_DIR).length}`);
  console.log('=====================================================');

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error in enrichment pipeline:', err);
  process.exit(1);
});
