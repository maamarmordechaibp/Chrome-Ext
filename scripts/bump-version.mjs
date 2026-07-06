// Bumps the patch version in package.json and public/manifest.json on every build,
// so the running extension always shows a new version number.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const manifestPath = join(root, 'public', 'manifest.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map((n) => parseInt(n, 10) || 0);
const next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = next;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Version bumped to ${next}`);
