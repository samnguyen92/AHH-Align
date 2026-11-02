'use client';

import { useState } from 'react';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setEmail('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
    >
      <div className="flex w-full items-center rounded-full bg-white/10 p-1.5 ring-1 ring-white/20 backdrop-blur-sm focus-within:ring-[var(--ahh-lime)]">
        <input
          id="newsletter-email"
          type="email"
          placeholder={submitted ? 'Thank you for subscribing!' : 'Enter your email address'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-10 min-w-0 flex-1 rounded-full border-0 bg-transparent px-4 text-sm text-white outline-none placeholder:text-white/60 sm:min-w-[240px]"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-[#D0FF71] px-6 text-sm font-semibold text-[#024E44] transition-colors hover:bg-[#dcff94]"
        >
          Subscribe
        </button>
      </div>
    </form>
  );
}
