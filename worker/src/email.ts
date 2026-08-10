// Sends a catalog PDF as an email attachment via Resend. Resend accepts the
// PDF inline as base64, so — unlike fax — no public media URL is needed.
import type { Env } from './index';

/** Per-company overrides; fall back to the Worker's global Resend config. */
export interface EmailOverrides {
  from?: string;
  apiKey?: string;
}

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  pdfBase64: string,
  filename: string,
  overrides: EmailOverrides = {},
): Promise<{ id: string }> {
  const apiKey = overrides.apiKey || env.RESEND_API_KEY;
  const from = overrides.from || env.EMAIL_FROM;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: 'Your catalog is attached.',
      attachments: [{ filename, content: pdfBase64 }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}
