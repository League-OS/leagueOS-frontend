import fs from 'node:fs';
import path from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/sync-version.mjs <x.y.z>');
  process.exit(1);
}

const repoRoot = process.cwd();
const targets = [
  'VERSION',
  'package.json',
  'apps/web/package.json',
  'apps/mobile/package.json',
  'packages/api/package.json',
  'packages/config/package.json',
  'packages/schemas/package.json',
  'packages/ui/package.json',
];

for (const relativePath of targets) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  if (relativePath.endsWith('package.json')) {
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    parsed.version = version;
    fs.writeFileSync(fullPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    continue;
  }
  fs.writeFileSync(fullPath, `${version}\n`, 'utf8');
}

console.log(`Synchronized frontend version to ${version}`);
