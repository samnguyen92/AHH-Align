'use client';

import { useState } from 'react';

export function NewsletterForm() {
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: integrate with email service (Resend / Mailchimp)
    setEmail('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-2 rounded-full bg-white p-1 shadow-sm ring-1 ring-[var(--ahh-border)] sm:w-auto sm:flex-row sm:items-center"
    >
      <input
        id="newsletter-email"
        type="email"
        placeholder="Enter your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="h-10 min-w-0 rounded-full border-0 bg-transparent px-4 text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)] sm:min-w-[260px]"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-full bg-[var(--ahh-deep-teal)] px-6 text-sm font-bold text-white transition-colors hover:bg-[var(--ahh-deep-teal-2)]"
      >
        Subscribe
      </button>
    </form>
  );
}
