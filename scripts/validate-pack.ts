import { readFileSync } from 'node:fs';
import { loadPack } from '@muster/shared';

// Usage: npm run validate-pack -- path/to/pack.json
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run validate-pack -- <pack.json>');
  process.exit(2);
}

let json: unknown;
try {
  json = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}

const r = loadPack(json);
if (!r.ok) {
  console.error(`${file} is not a valid pack (${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}):`);
  for (const e of r.errors) console.error(`  - ${e}`);
  process.exit(1);
}
const { pack } = r.index;
console.log(`OK: ${pack.name} v${pack.version}: ${pack.armies.length} armies, ${pack.units.length} units, ${pack.wargear.length} wargear, ${pack.rules.length} rules.`);
