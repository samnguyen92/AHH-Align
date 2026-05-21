# Git Workflow Guide

This repo deploys the Next.js app from GitHub to Vercel. Treat Git as the source of truth for what Vercel can build: if a fix is only local and has not been committed and pushed, Vercel will not see it.

## Branches

- `main` is the production deployment branch.
- Keep day-to-day fixes small and focused.
- For larger work, create a feature branch and merge it back into `main` after checks pass.

```bash
git switch main
git pull --ff-only origin main
git switch -c fix/short-description
```

## Daily Workflow

1. Start from the latest remote code.

```bash
git switch main
git pull --ff-only origin main
```

2. Check what is already modified before editing.

```bash
git status --short --branch
```

3. Make the code change.

4. Review exactly what changed.

```bash
git diff
git status --short
```

5. Run the basic checks before committing.

```bash
npx tsc --noEmit --pretty false
npm run lint
```

For deployment-related changes, also run:

```bash
npm run build
```

6. Commit only the files related to the change.

```bash
git add path/to/file.ts path/to/other-file.tsx
git commit -m "Fix concise description"
```

7. Push to GitHub.

```bash
git push origin main
```

If you are on a feature branch:

```bash
git push -u origin fix/short-description
```

## Before Deploying To Vercel

Confirm local `main` and GitHub `origin/main` point to the same commit.

```bash
git fetch origin main
git rev-parse HEAD origin/main
```

The two hashes should match. If they do not match, push or pull before deploying.

Check the latest commit:

```bash
git log --oneline --decorate -5
```

In Vercel, open the deployment's **Source** tab and confirm the commit hash is the same commit you expect.

## When Vercel Fails But Local Looks Fixed

This usually means Vercel is building a different commit than the one you are looking at locally.

1. Check local state.

```bash
git status --short --branch
git log --oneline --decorate -3
```

2. Fetch GitHub and compare commit hashes.

```bash
git fetch origin main
git rev-parse HEAD origin/main
```

3. Search for the failing import or symbol from the Vercel log.

```bash
rg "@/lib/supabase/client" src
rg "@/lib/supabase/server" src
```

4. If local is fixed but Vercel still fails, push the fix and redeploy the exact new commit.

```bash
git push origin main
```

In Vercel, use **Redeploy** and choose **without build cache** if the same module-resolution error repeats.

## Refresh Local Styles

Use this when Tailwind or layout changes do not appear in the browser, or when the page looks like it is still using old styles.

1. Stop the current dev server with `Ctrl+C`.

If Next says another dev server is already running, it will print a PID:

```text
Run kill 42764 to stop it.
```

Stop that exact process:

```bash
kill 42764
```

2. Clear the Next dev cache.

```bash
rm -rf .next
```

3. Start the dev server again.

```bash
npm run dev
```

4. Hard-refresh the browser.

- macOS Chrome/Safari: `Cmd+Shift+R`
- Windows/Linux Chrome: `Ctrl+Shift+R`

5. Re-check the page at the local URL printed by Next, usually:

```text
http://localhost:3000
```

If port `3000` is busy, Next may choose another port such as `3001`. Use the exact URL shown in the terminal.

Before committing style changes, run:

```bash
npx tsc --noEmit --pretty false
npm run lint
```

## Commit Hygiene

- Do not commit `.env.local`, secrets, API keys, generated logs, or virtual environments.
- Keep commits focused. A deployment fix should not include unrelated UI or data changes.
- Prefer clear commit messages:

```text
Fix Vercel Supabase client import
Add provider dashboard auth guard
Update OpenClaw deployment docs
```

- Avoid force-pushing `main` unless there is a deliberate recovery plan.
- Do not use `git reset --hard` or checkout files you did not intend to discard. Check `git status` and `git diff` first.

## Useful Commands

Show changed files:

```bash
git status --short
```

Show unstaged changes:

```bash
git diff
```

Show staged changes:

```bash
git diff --staged
```

Show files in a commit:

```bash
git show --stat --oneline HEAD
```

Show a file from a previous commit:

```bash
git show HEAD~1:src/app/api/analytics/route.ts
```

Undo only unstaged edits in one file:

```bash
git restore path/to/file.ts
```

Unstage a file while keeping the edits:

```bash
git restore --staged path/to/file.ts
```

## Recommended Pre-Push Checklist

- `git status --short` shows only intended files.
- `git diff --staged` matches the commit message.
- `npx tsc --noEmit --pretty false` passes.
- `npm run lint` has no errors.
- `npm run build` passes for deploy-facing changes.
- The commit is pushed to `origin/main`.
- The Vercel deployment Source tab shows the expected commit hash.
