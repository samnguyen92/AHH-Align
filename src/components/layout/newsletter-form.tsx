'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function NewsletterForm() {
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: integrate with email service (Resend / Mailchimp)
    setEmail('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full md:w-auto">
      <Input
        id="newsletter-email"
        type="email"
        placeholder="Enter your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="h-10 min-w-[220px] bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-[var(--ahh-blue)]"
      />
      <Button
        type="submit"
        className="h-10 px-6 bg-[var(--ahh-blue)] hover:bg-[var(--ahh-blue-dark)] text-white font-semibold shrink-0"
      >
        Subscribe
      </Button>
    </form>
  );
}
