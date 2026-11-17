import { HomePage } from '@/components/site/home';
import { getHomeData } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await getHomeData();
  return <HomePage data={data} />;
}
