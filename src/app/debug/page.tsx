import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const supabase = createServerSupabaseClient();
  const { data: articles } = await supabase.from('articles').select('slug, title, status');
  const { data: clinics } = await supabase.from('clinics').select('slug, name');

  return (
    <div className="p-10 font-mono text-xs">
      <h1 className="text-xl font-bold mb-4">Debug Database Slugs</h1>
      
      <section className="mb-8">
        <h2 className="text-lg font-bold">Articles</h2>
        <pre>{JSON.stringify(articles, null, 2)}</pre>
      </section>

      <section>
        <h2 className="text-lg font-bold">Clinics</h2>
        <pre>{JSON.stringify(clinics, null, 2)}</pre>
      </section>
    </div>
  );
}
