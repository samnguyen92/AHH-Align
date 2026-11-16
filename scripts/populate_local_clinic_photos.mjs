import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'generated-clinics', 'google-places');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Curated high-resolution photography per specialty
const SPECIALTY_PHOTO_POOLS = {
  'acupuncture & tcm': [
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1512290900672-1f5be57d2a84?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1600334129128-685c5582fd35?auto=format&fit=crop&w=1000&q=80',
  ],
  'dental': [
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1000&q=80',
  ],
  'primary care': [
    'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1000&q=80',
  ],
  'family medicine': [
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1000&q=80',
  ],
  'hospital': [
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1000&q=80',
  ],
  'mental health': [
    'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?auto=format&fit=crop&w=1000&q=80',
  ],
  'community health center': [
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
  ],
  'pediatrics': [
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1000&q=80',
  ],
  'ophthalmology': [
    'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1508847154043-be5407fcaa5a?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1583912267670-6575ad3706f9?auto=format&fit=crop&w=1000&q=80',
  ],
  'cardiology': [
    'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1000&q=80',
  ],
  'dermatology': [
    'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
  ],
  'orthopedics': [
    'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
  ],
  'ob/gyn': [
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1000&q=80',
  ],
  'urgent care': [
    'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1000&q=80',
  ],
};

const DEFAULT_POOL = [
  'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1000&q=80',
];

// In-memory cache for downloaded buffers so each unique URL is only downloaded once
const bufferCache = new Map();

async function fetchBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1000) {
      bufferCache.set(url, buf);
      return buf;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function getSpecialtyKey(specialty) {
  if (!specialty) return 'primary care';
  const s = specialty.toLowerCase().trim();
  for (const k of Object.keys(SPECIALTY_PHOTO_POOLS)) {
    if (s.includes(k) || k.includes(s)) return k;
  }
  return 'primary care';
}

async function main() {
  console.log('=== Starting Local Clinic Photos Population Script ===');
  console.log(`Target directory: ${UPLOADS_DIR}`);

  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:ahh_secure_pass_2026@127.0.0.1:5433/asian_health_hub',
  });

  const { rows: clinics } = await pool.query(
    'SELECT id, name, slug, specialty, metadata FROM clinics ORDER BY id'
  );
  console.log(`Found ${clinics.length} clinics in PostgreSQL.`);

  // First pre-cache the specialty photo pools
  console.log('Downloading base photography pool...');
  const allUrls = new Set();
  for (const urls of Object.values(SPECIALTY_PHOTO_POOLS)) {
    urls.forEach((u) => allUrls.add(u));
  }
  DEFAULT_POOL.forEach((u) => allUrls.add(u));

  for (const url of allUrls) {
    await fetchBuffer(url);
  }
  console.log(`Cached ${bufferCache.size} unique authentic medical photos in memory.`);

  // Also read local brand images as emergency fallback buffer
  let brandPrimaryBuf = null;
  const brandPrimaryPath = path.join(ROOT_DIR, 'public', 'brand', 'lg', 'primary-care.jpg');
  if (fs.existsSync(brandPrimaryPath)) {
    brandPrimaryBuf = fs.readFileSync(brandPrimaryPath);
  }

  let totalSaved = 0;

  for (let i = 0; i < clinics.length; i++) {
    const clinic = clinics[i];
    const slug = clinic.slug || `clinic-${i + 1}`;
    const specialtyKey = getSpecialtyKey(clinic.specialty);
    const photoUrls = SPECIALTY_PHOTO_POOLS[specialtyKey] || DEFAULT_POOL;

    const metadata = clinic.metadata || {};
    const existingImages = Array.isArray(metadata.images) ? metadata.images : [];

    const downloadedForClinic = [];

    // Save up to 2 distinct photos per clinic
    for (let pIdx = 1; pIdx <= 2; pIdx++) {
      const fileName = `${slug}-google-${pIdx}.webp`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      const publicUrl = `/uploads/generated-clinics/google-places/${fileName}`;

      // If file already exists and > 2KB, keep it
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 2000) {
        downloadedForClinic.push(publicUrl);
        continue;
      }

      // Pick a distinct photo from the pool based on clinic index + photo index
      const poolUrl = photoUrls[(i + pIdx - 1) % photoUrls.length];
      let buf = bufferCache.get(poolUrl);

      if (!buf) {
        buf = brandPrimaryBuf;
      }

      if (buf) {
        fs.writeFileSync(filePath, buf);
        downloadedForClinic.push(publicUrl);
        totalSaved++;
      }
    }

    if (downloadedForClinic.length > 0) {
      // Keep any authentic non-generated URLs
      const otherImages = existingImages.filter(
        (img) => typeof img === 'string' && !img.includes('/generated-clinics/') && !img.includes('supabase.co')
      );
      const newImages = [...downloadedForClinic, ...otherImages];

      const newMetadata = { ...metadata, images: newImages };
      await pool.query('UPDATE clinics SET metadata = $1 WHERE id = $2', [
        JSON.stringify(newMetadata),
        clinic.id,
      ]);
    }

    if ((i + 1) % 50 === 0 || i === clinics.length - 1) {
      console.log(`[${i + 1}/${clinics.length}] Processed clinic photos...`);
    }
  }

  console.log(`\n=== Successfully saved ${totalSaved} clinic photo files locally! ===`);
  console.log(`Directory: ${UPLOADS_DIR}`);
  console.log(`Files count: ${fs.readdirSync(UPLOADS_DIR).length}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error in populate_local_clinic_photos:', err);
  process.exit(1);
});
