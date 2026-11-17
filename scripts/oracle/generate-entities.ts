/**
 * Updates the groups in src/render/entities.ts from cmark-gfm's
 * entities.inc. It keeps the names whose first decoded byte is ASCII, the only
 * values the scanner reads. With `--check`, it verifies the current table
 * instead of writing it.
 *
 * Usage: node scripts/oracle/generate-entities.ts [--check] [<entities.inc>] [<entities.ts>]
 *
 * The defaults are entities.inc from the oracle build and this checkout's
 * entities.ts.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { cacheDirectory } from './oracle.ts';

const { values, positionals } = parseArgs({
	options: {
		check: { type: 'boolean' },
	},
	allowPositionals: true,
});
const [
	inputPath = new URL('cmark-gfm-0.29.0.gfm.13/src/entities.inc', cacheDirectory),
	outputPath = new URL('../../src/render/entities.ts', import.meta.url),
] = positionals;

const source = fs.readFileSync(inputPath, 'utf8');
const entries = [...source.matchAll(/\{\(unsigned char\*\)"([^"]+)", \{([^}]+)\}\}/g)];
const names = new Set(entries.map(([, name]) => name));
if (entries.length !== 2125 || names.size !== 2125) {
	throw new Error('Expected 2125 unique names');
}

// Each entity is stored with its decoded byte length and, when its first
// decoded byte is ASCII, that byte. Backslash removal after decoding needs that
// byte, as in `\&bne;`, which decodes to `=` and a combining character.
//
// A name whose first decoded byte is outside ASCII is dropped. The scanner
// never decodes it: its source text is escaped, and no tokenizer state
// transition compares a non-ASCII character. The reference budget then counts
// the entity's source bytes instead of its decoded size, which is the recorded
// known gap in notes/gfm-comments/known-gaps.md. Keep every name whose value
// starts with ASCII so that `&amp;` and `\&bne;` stay exact.
const groups = new Map<string, string[]>();
for (const [, name, raw] of entries) {
	const bytes = raw.split(',').map(Number).filter(byte => byte !== 0);
	if (bytes.length > name.length + 3) {
		throw new Error(`Decoding grows ${name} by more than 1 byte`);
	}
	// The scanner tracks a decoded backslash only as a whole entity, `&bsol;`.
	if (bytes.length > 1 && bytes.includes(92)) {
		throw new Error(`${name} decodes to a backslash among other bytes`);
	}
	if (bytes[0] >= 128) {
		continue;
	}
	const key = `${bytes.length}, ${bytes[0]}`;
	groups.set(key, [...groups.get(key) ?? [], name]);
}

const keptNames = [...groups.values()].reduce((count, groupNames) => count + groupNames.length, 0);
if (keptNames !== 49) {
	throw new Error(`Expected 49 names whose first decoded byte is ASCII, got ${keptNames}`);
}

const lines = [...groups]
	.sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
	.map(([key, groupNames]) => `\t[${key}, '${groupNames.join(' ')}'],`);

const current = fs.readFileSync(outputPath, 'utf8');
const marker = 'const groups: Entity[] = [\n';
const start = current.indexOf(marker);
const end = current.indexOf('\n];', start + marker.length);
if (start === -1 || end === -1 || current.includes(marker, start + marker.length)) {
	throw new Error('Expected one groups section in entities.ts');
}
const updated = current.slice(0, start + marker.length) + lines.join('\n') + current.slice(end);
if (values.check) {
	if (updated !== current) {
		throw new Error('The generated groups differ from entities.ts');
	}
} else {
	fs.writeFileSync(outputPath, updated);
}
console.log(`Checked ${entries.length} names and kept ${keptNames} whose first decoded byte is ASCII; groups ${values.check ? 'match' : 'updated'}`);
