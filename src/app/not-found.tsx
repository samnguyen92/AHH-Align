import type { Metadata } from 'next';
import { Caption, Grid, Page, PhotoTile, Pill, Tile, pad } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <Page>
      <Grid className="md:min-h-[calc(100svh-8rem)] md:grid-cols-2">
        <Tile tone="stone" className={`flex min-h-[26rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption>Error 404</Caption>
          <div>
            <h1 className="text-[clamp(2.75rem,6.5vw,6.5rem)] font-bold leading-[0.92] tracking-tight">
              This page
              <br />
              isn’t here
            </h1>
            <Caption className="mt-5 opacity-75">It may have moved, or the link may be out of date</Caption>
            <div className="mt-7 flex flex-wrap gap-2">
              <Pill href="/search">Find a Clinic</Pill>
              <Pill href="/" variant="line">Go to the home page</Pill>
            </div>
          </div>
        </Tile>
        <PhotoTile src="/brand/photos/a2-section2.webp" alt="" className="min-h-[20rem]" eager />
      </Grid>
    </Page>
  );
}
