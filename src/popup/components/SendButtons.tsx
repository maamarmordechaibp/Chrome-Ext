// Fax / Email buttons for a catalog PDF. Prompts for the destination, pulls the
// PDF blob lazily, and sends it through the Worker.
import React, { useState } from 'react';
import { sendFax, sendEmail } from '../../cloud/faxService';

interface Props {
  getBlob: () => Promise<Blob | null | undefined>;
  filenameBase: string;
}

export const SendButtons: React.FC<Props> = ({ getBlob, filenameBase }) => {
  const [busy, setBusy] = useState<'fax' | 'email' | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (
    kind: 'fax' | 'email',
    promptText: string,
    send: (blob: Blob, to: string) => Promise<void>,
  ) => {
    const to = window.prompt(promptText);
    if (!to || !to.trim()) return;
    setBusy(kind); setMsg(''); setErr('');
    try {
      const blob = await getBlob();
      if (!blob) throw new Error('No PDF available for this catalog.');
      await send(blob, to.trim());
      setMsg(`${kind === 'fax' ? 'Fax' : 'Email'} sent to ${to.trim()}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <button
          onClick={() => run('fax', 'Fax number to send to (e.g. +15555550123):',
            (b, to) => sendFax(b, to))}
          disabled={busy !== null}
          className="flex-1 text-[10px] py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-teal-700 disabled:opacity-50">
          {busy === 'fax' ? '⏳ Faxing…' : '📠 Fax'}
        </button>
        <button
          onClick={() => run('email', 'Email address to send to:',
            (b, to) => sendEmail(b, to, 'Your catalog', `${filenameBase}.pdf`))}
          disabled={busy !== null}
          className="flex-1 text-[10px] py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-700 disabled:opacity-50">
          {busy === 'email' ? '⏳ Emailing…' : '✉️ Email'}
        </button>
      </div>
      {msg && <p className="text-[9px] text-green-600">✓ {msg}</p>}
      {err && <p className="text-[9px] text-red-600">⚠ {err}</p>}
    </div>
  );
};
