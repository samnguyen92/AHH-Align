# Deploy Asian Health Hub to Vercel

This project is a Next.js web app. OpenClaw is a separate Python operations bot and is not deployed to Vercel.

## 1. Pre-deploy Checklist

- Push the repo to GitHub, GitLab, or Bitbucket.
- Confirm Supabase has the schema from `supabase/schema.sql`.
- Confirm public read policies are enabled for `clinics` and `articles`.
- Make sure `.env.local` is not committed.
- Keep `openclaw/` running separately on your machine or server if you need Telegram bot jobs.

## 2. Required Vercel Environment Variables

Add these in Vercel Project Settings > Environment Variables for Production and Preview.

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SECRET_KEY=your-service-role-or-secret-key
SUPABASE_STORAGE_BUCKET=generated-images
```

Supported alternatives:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional for web deployment:

```bash
OPENROUTER_API_KEY=sk-or-...
```

Do not add Telegram variables to Vercel unless you intentionally build a hosted bot process. The current Telegram bot is a long-running Python script and should run outside Vercel.

## 3. Vercel Dashboard Deployment

1. Go to <https://vercel.com/new>.
2. Import the Git repository.
3. Framework Preset: `Next.js`.
4. Root Directory: repository root.
5. Build Command: `npm run build`.
6. Install Command: `npm install`.
7. Output Directory: leave empty/default.
8. Add the environment variables above.
9. Click Deploy.

## 4. Vercel CLI Deployment

```bash
npm install -g vercel
vercel login
vercel
vercel env add NEXT_PUBLIC_SITE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel --prod
```

For Preview deployments, also add the same variables to `preview`:

```bash
vercel env add NEXT_PUBLIC_SITE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY preview
vercel env add SUPABASE_SECRET_KEY preview
```

## 5. After Deployment

- Open `/insights` and one article detail page.
- Open `/search` and test clinic search.
- Open `/api/health/supabase` to confirm Vercel can read Supabase env variables and table counts.
- Check Vercel deployment logs if Supabase env variables are missing.
- Update `NEXT_PUBLIC_SITE_URL` to the final Vercel or custom domain, then redeploy.
- In Supabase Storage, create a public bucket named `generated-images` so OpenClaw can upload generated article and clinic images without committing image files to Git.

## 6. OpenClaw / Telegram Bot

Vercel is for the website. Run OpenClaw separately:

```bash
cd openclaw
source venv/bin/activate
python telegram_bot.py
```

For a long-running bot, use a VPS, Render worker, Railway worker, Fly.io machine, or a local machine with `pm2`, `systemd`, or `launchd`.

## 7. Run OpenClaw Locally With Docker Desktop

Docker Desktop is a good local option while you are developing. Your Mac must stay on, Docker Desktop must stay running, and internet must be stable.

Required env file:

```bash
openclaw/.env
```

Minimum variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-or-secret-key
SUPABASE_STORAGE_BUCKET=generated-images
GOOGLE_PLACES_API_KEY=your-google-places-api-key
OPENROUTER_API_KEY=sk-or-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_MAX_JOB_OUTPUT_CHUNKS=12
```

`GOOGLE_PLACES_API_KEY` is optional, but required if you want OpenClaw to enrich clinic records with Google rating, review snippets, Maps URL, latitude/longitude, opening hours, and Google place photos. Enable Places API (New) in Google Cloud for that key.

Build and start:

```bash
docker compose up --build -d openclaw-bot
```

View logs:

```bash
docker compose logs -f openclaw-bot
```

Restart after code changes:

```bash
docker compose restart openclaw-bot
```

Rebuild after `requirements.txt` or Dockerfile changes:

```bash
docker compose up --build -d openclaw-bot
```

Stop:

```bash
docker compose down
```

The compose file mounts:

- `./openclaw` to `/app/openclaw` for local code iteration
- `./public/generated-insights` to `/app/public/generated-insights` as a fallback only. Generated images should normally be uploaded to Supabase Storage.
