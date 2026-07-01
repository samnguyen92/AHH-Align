import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/services/supabase-server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { email?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();

  // Basic email validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Insert into newsletter_subscriptions (UNIQUE constraint handles duplicates gracefully)
  const { error } = await supabase
    .from('newsletter_subscriptions')
    .insert({ email })
    .select('id')
    .single();

  if (error) {
    // Duplicate email — treat as success so we don't leak subscriber status
    if (error.code === '23505') {
      return NextResponse.json({ success: true, message: 'Already subscribed.' });
    }
    console.error('[Newsletter API] Supabase insert error:', error.message);
    return NextResponse.json({ error: 'Failed to subscribe. Please try again.' }, { status: 500 });
  }

  // Fire-and-forget Telegram notification
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  await sendTelegramMessage(
    `📧 <b>New Newsletter Subscription</b>\n\n` +
    `• <b>Email:</b> ${email}\n` +
    `• <b>Time (PT):</b> ${now}`
  );

  return NextResponse.json({ success: true, message: 'Subscribed successfully.' });
}
