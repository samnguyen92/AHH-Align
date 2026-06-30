'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { BrandLogo } from './brand-logo';
import {
  Stethoscope,
  BookOpen,
  Activity,
  User,
  Star,
  Globe,
  Search,
  ChevronRight,
} from 'lucide-react';

interface NavLink {
  readonly href: string;
  readonly label: string;
}

interface MobileNavProps {
  links?: readonly NavLink[];
}

export function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  const menuItems = [
    { href: '/search', label: 'Directory', icon: Stethoscope, hasArrow: true },
    { href: '/insights', label: 'Insights', icon: BookOpen, hasArrow: true },
    { href: '/pulse', label: 'Pulse', icon: Activity, hasArrow: true },
    { href: '/about', label: 'About', icon: User, hasArrow: true },
    { href: '/claim', label: 'Claim a Free Profile', icon: Star, hasArrow: true },
    { href: '#', label: 'English', icon: Globe, hasArrow: false },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="lg:hidden p-2 hover:bg-transparent" />
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--ahh-deep-teal)] cursor-pointer"
        >
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[310px] sm:w-[350px] p-6 rounded-r-[28px] border-r-0 flex flex-col justify-between bg-white shadow-2xl overflow-y-auto"
      >
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div onClick={() => setOpen(false)} className="cursor-pointer">
              <BrandLogo href="/" />
            </div>
          </div>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <nav className="flex flex-col">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-4 border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5FAF7] text-[var(--ahh-deep-teal)] group-hover:bg-emerald-50 transition-colors shrink-0">
                      <IconComponent className="h-5 w-5 stroke-[1.8]" />
                    </span>
                    <span className="text-[15px] font-bold text-[var(--ahh-ink)]">{item.label}</span>
                  </div>
                  {item.hasArrow && (
                    <ChevronRight className="h-4.5 w-4.5 text-gray-400 group-hover:text-[var(--ahh-deep-teal)] group-hover:translate-x-0.5 transition-all" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6">
          <Link
            href="/search"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 rounded-[18px] bg-[var(--ahh-lime)] py-4 px-6 text-[15px] font-bold text-[var(--ahh-deep-teal)] shadow-[0_12px_28px_rgba(208,255,113,0.32)] hover:bg-[var(--ahh-lime)]/90 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border-0 w-full"
          >
            <Search className="h-5 w-5 stroke-[2.5]" />
            Find a Clinic
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

