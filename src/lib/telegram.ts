/**
 * Shared Telegram notification utility for Next.js API routes.
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID from environment variables.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rawChatIds = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !rawChatIds) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set. Skipping notification.');
    return;
  }

  const chatIds = rawChatIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  await Promise.all(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          console.error(`[Telegram] Failed to send message to ${chatId}: ${res.status} ${body}`);
        }
      } catch (err) {
        console.error(`[Telegram] Error sending notification to ${chatId}:`, err);
      }
    })
  );
}
