import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

interface CityCardProps {
  name: string;
  state: string;
  clinicCount: number;
  gradient: string;
}

const FEATURED_CITIES: CityCardProps[] = [
  { name: 'San Jose', state: 'CA', clinicCount: 1200, gradient: 'from-teal-500 to-cyan-400' },
  { name: 'Houston', state: 'TX', clinicCount: 950, gradient: 'from-emerald-500 to-teal-400' },
  { name: 'Los Angeles', state: 'CA', clinicCount: 2100, gradient: 'from-blue-500 to-indigo-400' },
  { name: 'New York', state: 'NY', clinicCount: 1800, gradient: 'from-violet-500 to-purple-400' },
  { name: 'Seattle', state: 'WA', clinicCount: 680, gradient: 'from-cyan-500 to-blue-400' },
  { name: 'Chicago', state: 'IL', clinicCount: 720, gradient: 'from-rose-500 to-pink-400' },
];

function CityCard({ name, state, clinicCount, gradient }: CityCardProps) {
  return (
    <Link href={`/search?city=${encodeURIComponent(name)}&state=${state}`}>
      <Card className="group relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer">
        {/* Gradient background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />

        <CardContent className="relative z-10 p-6 text-white">
          <h3 className="text-xl font-bold mb-1 group-hover:tracking-wide transition-all">
            {name}
          </h3>
          <p className="text-sm text-white/80">{state}</p>
          <p className="mt-3 text-sm font-medium text-white/90">
            {clinicCount.toLocaleString()}+ providers
          </p>
        </CardContent>

        {/* Hover shine effect */}
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
      </Card>
    </Link>
  );
}

export function FeaturedCities() {
  return (
    <section id="featured-cities" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Popular Cities
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Find providers in your area
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {FEATURED_CITIES.map((city) => (
            <CityCard key={city.name} {...city} />
          ))}
        </div>
      </div>
    </section>
  );
}
