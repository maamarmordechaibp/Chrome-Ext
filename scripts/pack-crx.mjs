// Packs the built `dist/` folder into a self-hosted, auto-updating Chrome
// extension bundle for GitHub hosting (Path B).
//
// Outputs (into `release/`):
//   - extension.crx        the signed, installable extension
//   - update.xml           Chrome's auto-update manifest (points at the .crx)
//   - dist.zip             a plain zip of dist/ (for "Load unpacked" or Web Store)
//   - install-policy.reg   Windows registry policy to force-install + auto-update
//
// The signing key lives in `key.pem` (git-ignored). Keep it safe and identical
// across releases — it determines the extension's permanent ID. In CI it is
// provided via the CRX_PRIVATE_KEY secret.
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crx3 from 'crx3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const outDir = join(root, 'release');
const keyPath = join(root, 'key.pem');

// Where the release assets will be reachable. GitHub's "latest release" URLs are
// stable across versions, so update.xml can always point at them.
// Override with CRX_BASE_URL if you host elsewhere (e.g. GitHub Pages).
const repo = process.env.GITHUB_REPOSITORY; // "owner/repo" in Actions
const baseUrl = (
  process.env.CRX_BASE_URL ||
  (repo
    ? `https://github.com/${repo}/releases/latest/download`
    : 'https://github.com/OWNER/REPO/releases/latest/download')
).replace(/\/+$/, '');

const exists = (p) => access(p).then(() => true).catch(() => false);

// Derive the Chrome extension ID from the key's public half.
function extensionIdFromKey(pem) {
  const pub = crypto.createPublicKey(crypto.createPrivateKey(pem));
  const der = pub.export({ type: 'spki', format: 'der' });
  const hash = crypto.createHash('sha256').update(der).digest();
  return hash
    .subarray(0, 16)
    .toString('hex')
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

async function ensureKey() {
  if (await exists(keyPath)) return;

  if (process.env.CRX_PRIVATE_KEY) {
    await writeFile(keyPath, process.env.CRX_PRIVATE_KEY, 'utf8');
    console.log('Wrote key.pem from CRX_PRIVATE_KEY.');
    return;
  }

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(keyPath, pem, 'utf8');
  console.warn(
    '\n  No key.pem found — generated a new one.\n' +
      '  BACK THIS FILE UP and reuse it for every release, or the extension\n' +
      '  ID will change and auto-updates will break. In CI, store its contents\n' +
      "  as the 'CRX_PRIVATE_KEY' repository secret.\n"
  );
}

async function main() {
  if (!(await exists(distDir))) {
    throw new Error('dist/ not found. Run `npm run build` first.');
  }
  await ensureKey();
  await mkdir(outDir, { recursive: true });

  // Tell the packed extension where to check for updates.
  const manifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const version = manifest.version;
  manifest.update_url = `${baseUrl}/update.xml`;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const crxPath = join(outDir, 'extension.crx');
  const zipPath = join(outDir, 'dist.zip');

  // crx3 packs the whole directory that contains the streamed manifest.json.
  await crx3(createReadStream(manifestPath), { keyPath, crxPath, zipPath });

  const pem = await readFile(keyPath, 'utf8');
  const id = extensionIdFromKey(pem);

  const updateXml =
    `<?xml version='1.0' encoding='UTF-8'?>\n` +
    `<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n` +
    `  <app appid='${id}'>\n` +
    `    <updatecheck codebase='${baseUrl}/extension.crx' version='${version}' />\n` +
    `  </app>\n` +
    `</gupdate>\n`;
  await writeFile(join(outDir, 'update.xml'), updateXml, 'utf8');

  const reg =
    `Windows Registry Editor Version 5.00\r\n\r\n` +
    `; Force-installs the extension and lets Chrome auto-update it from GitHub.\r\n` +
    `; Double-click and accept (run as administrator). Restart Chrome afterwards.\r\n` +
    `[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionSettings\\${id}]\r\n` +
    `"installation_mode"="force_installed"\r\n` +
    `"update_url"="${baseUrl}/update.xml"\r\n`;
  await writeFile(join(outDir, 'install-policy.reg'), reg, 'utf8');

  console.log('\nPackaged extension:');
  console.log(`  version:      ${version}`);
  console.log(`  extension ID: ${id}`);
  console.log(`  update URL:   ${baseUrl}/update.xml`);
  console.log(`  artifacts:    release/{extension.crx, update.xml, dist.zip, install-policy.reg}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
