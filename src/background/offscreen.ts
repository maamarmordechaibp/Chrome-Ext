// Runs in an MV3 offscreen document (a real DOM page) so the background job can
// use canvas, jsPDF, the person-redaction model and the persisted Firebase
// session — none of which are available in the service worker. The worker drives
// it with a single RUN_JOB message and awaits the finished/sent result.
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../cloud/firebase';
import { buildCatalog, BuildCatalogInput } from '../popup/catalogBuilder';
import { sendEmail, sendFax, logUsage } from '../cloud/faxService';
import { JobDestinations } from '../types';
import { installOffscreenStorageProxy } from './offscreenStorage';

// chrome.storage isn't exposed to offscreen documents; route it to the worker.
installOffscreenStorageProxy();

interface RunJobPayload extends BuildCatalogInput {
  destinations: JobDestinations;
}

/** Resolves once Firebase has restored the persisted sign-in (or confirmed none). */
function authReady(): Promise<void> {
  return new Promise((resolve) => {
    if (auth.currentUser) { resolve(); return; }
    const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
  });
}

async function runJob(payload: RunJobPayload): Promise<{ catalogId: string; sent: string[] }> {
  await authReady();
  if (!auth.currentUser) throw new Error('Not signed in on this computer.');
  const { destinations, ...input } = payload;
  const built = await buildCatalog(input);
  const filename = `${built.id}.pdf`;
  const subject = `Catalog ${built.id}`;
  const sent: string[] = [];
  if (destinations.email) { await sendEmail(built.blob, destinations.email, subject, filename); sent.push('email'); }
  if (destinations.fax) { await sendFax(built.blob, destinations.fax); void logUsage('faxes'); sent.push('fax'); }
  return { catalogId: built.id, sent };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return undefined;
  if (message.type === 'RUN_JOB') {
    runJob(message.payload as RunJobPayload)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }));
    return true; // async response
  }
  return undefined;
});
