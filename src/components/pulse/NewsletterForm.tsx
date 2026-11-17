'use client';

import { useState } from 'react';
import { ArrowRight, Mail, CheckCircle2 } from 'lucide-react';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Something went wrong. Please try again.');
      } else {
        setStatus('success');
        setMessage("You're subscribed! Watch your inbox for the next issue.");
        setEmail('');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please check your connection and try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className="mt-7 flex w-full max-w-[32rem] items-center gap-3 rounded-full bg-white px-5 py-4 text-[#0D1F1C]" role="status">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[#024E44]" aria-hidden="true" />
        <p className="text-sm font-semibold">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 w-full max-w-[32rem]">
      <div className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 text-[#0D1F1C] ring-1 ring-[#0D1F1C]/10 focus-within:ring-[#024E44]">
        <Mail className="h-5 w-5 shrink-0 opacity-50" aria-hidden="true" />
        <label htmlFor="pulse-email" className="sr-only">Email address</label>
        <input
          id="pulse-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="h-11 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-[#0D1F1C]/45"
          required
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[#024E44] px-6 text-sm font-bold text-white btn-fx focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#024E44] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
          {status !== 'loading' && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {status === 'error' && <p className="mt-2 pl-5 text-xs font-semibold text-red-700">{message}</p>}
    </form>
  );
}
