'use client';

// Shown when a page fails to render; same tile layout as the 404 page, with a retry.
import { useEffect } from 'react';
import { Caption, Grid, Page, PhotoTile, Pill, Roll, Tile, pad, ring } from '@/components/site/ui';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page>
      <Grid className="md:min-h-[calc(100svh-8rem)] md:grid-cols-2">
        <Tile tone="stone" className={`flex min-h-[26rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption>Something went wrong</Caption>
          <div>
            <h1 className="text-[clamp(2.75rem,6.5vw,6.5rem)] font-bold leading-[0.92] tracking-tight">
              This page
              <br />
              didn’t load
            </h1>
            <Caption className="mt-5 opacity-75">Please try again in a moment</Caption>
            <div className="mt-7 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className={`btn-fx inline-flex shrink-0 items-center justify-center rounded-full bg-[#024E44] px-6 py-3 text-sm font-bold text-white md:px-7 md:py-4 md:text-base ${ring}`}
              >
                <Roll>Try again</Roll>
              </button>
              <Pill href="/" variant="line">Go to the home page</Pill>
            </div>
          </div>
        </Tile>
        <PhotoTile src="/brand/photos/a2-section2.webp" alt="" className="min-h-[20rem]" eager />
      </Grid>
    </Page>
  );
}
