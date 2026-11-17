'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'done' | 'error';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not subscribe. Please try again.');
        return;
      }
      setStatus('done');
      setMessage('You’re subscribed. Look for the next issue in your inbox.');
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Could not reach the server. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="lg-news" noValidate={false}>
      <label htmlFor="newsletter-email" className="lg-news-label">
        Email address
      </label>
      <div className="lg-news-row">
        <input
          id="newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          required
          aria-invalid={status === 'error'}
          aria-describedby="newsletter-status"
        />
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </div>
      <p id="newsletter-status" className="lg-news-status" data-status={status} role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
