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

interface NavLink {
  readonly href: string;
  readonly label: string;
}

interface MobileNavProps {
  links: readonly NavLink[];
}

export function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="md:hidden p-2" />
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetTitle className="text-lg font-bold mb-6">
          Asian<span className="text-gradient">Health</span>Hub
        </SheetTitle>
        <nav className="flex flex-col gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="px-4 py-3 text-sm font-medium rounded-lg transition-colors hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/claim"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex items-center justify-center px-4 py-3 text-sm font-medium rounded-lg bg-[var(--ahh-teal)] text-white hover:bg-[var(--ahh-teal-dark)] transition-colors"
          >
            For Providers
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
