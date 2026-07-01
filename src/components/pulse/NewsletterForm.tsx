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
      <div className="mt-8 w-full max-w-[440px] rounded-[24px] bg-[#FDFBF9] p-6 shadow-[0_18px_50px_rgba(2,78,68,0.18)] border border-white text-left flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F0EB] text-[var(--ahh-deep-teal)]">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="text-center text-sm font-semibold text-[var(--ahh-ink)]">{message}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 w-full max-w-[440px] rounded-[24px] bg-[#FDFBF9] p-5 sm:p-6 shadow-[0_18px_50px_rgba(2,78,68,0.18)] border border-white text-left space-y-4"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F0EB] text-[var(--ahh-deep-teal)] mb-4">
        <Mail className="h-5 w-5" />
      </div>

      <div className="flex min-h-12 w-full items-center gap-2.5 rounded-[12px] border border-[#E9EEF4] px-4 bg-white focus-within:border-[var(--ahh-deep-teal)] focus-within:ring-2 focus-within:ring-[var(--ahh-deep-teal)]/10 transition">
        <Mail className="h-4 w-4 text-[var(--ahh-muted)] shrink-0" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          className="w-full bg-transparent text-sm text-[var(--ahh-ink)] outline-none placeholder:text-[var(--ahh-muted-2)]"
          required
          disabled={status === 'loading'}
        />
      </div>

      {status === 'error' && (
        <p className="text-xs text-red-500">{message}</p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full min-h-12 rounded-full bg-[var(--ahh-deep-teal)] text-white text-sm font-bold flex items-center justify-center gap-2 transition hover:bg-[#024e44]/90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? 'Subscribing...' : 'Subscribe Free'}
        {status !== 'loading' && <ArrowRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
