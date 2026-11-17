/**
 * Compares cmark-gfm's case fold with JavaScript's toLowerCase().toUpperCase()
 * on every Unicode scalar, and prints the exception ranges for
 * src/references/label.ts. Run it after
 * `pnpm oracle:build`, which builds fold-scalars.
 *
 * Usage: node scripts/oracle/compare-folds.ts
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cacheDirectory } from './oracle.ts';

const output = spawnSync(fileURLToPath(new URL('fold-scalars', cacheDirectory)), {
	encoding: 'utf8',
	maxBuffer: 50_000_000,
});
if (output.status !== 0) {
	throw new Error(output.error?.message ?? output.stderr);
}

// cmark-gfm's encoder writes U+FFFE and U+FFFF as the single bytes 0xFE and
// 0xFF (utf8.c:202-207), which do not decode as UTF-8. Each folds to itself.
const folds = new Map<string, string>();
const changed: string[] = [];
for (const line of output.stdout.trimEnd().split('\n')) {
	const [point, hex] = line.split('\t');
	const input = String.fromCodePoint(Number.parseInt(point, 16));
	const folded = point === 'fffe' || point === 'ffff' ? input : Buffer.from(hex, 'hex').toString('utf8');
	if (folded !== input) {
		folds.set(input, folded);
	}
	if (folded !== input || input.toLowerCase().toUpperCase() !== input) {
		changed.push(input);
	}
}

const fold = (text: string) => Array.from(text).map(char => folds.get(char) ?? char).join('');
const exceptions = new Set(changed.filter(
	char => fold(char.toLowerCase().toUpperCase()) !== fold(char),
));
console.log('changed', changed.length, 'exceptions', exceptions.size);
console.log('exceptions that cmark folds', [...exceptions].filter(char => fold(char) !== char).length);

const ranges: [number, number][] = [];
for (const char of exceptions) {
	const code = char.codePointAt(0)!;
	const previous = ranges.at(-1);
	if (previous && previous[1] + 1 === code) {
		previous[1] = code;
	} else {
		ranges.push([code, code]);
	}
}
console.log('ranges', JSON.stringify(ranges.map(range => range.map(code => code.toString(16)))));

// The scanner's key: exceptions stay as they are, and the rest is case-mapped.
const key = (text: string) => Array.from(text).map(
	char => (exceptions.has(char) ? char : char.toLowerCase().toUpperCase()),
).join('');

// The key of a whole label, as normalizeLabel computes it: each run between
// exceptions is case-mapped as one string.
const runKey = (text: string) => {
	let result = '';
	let run = '';
	for (const char of text) {
		if (exceptions.has(char)) {
			result += run.toLowerCase().toUpperCase() + char;
			run = '';
		} else {
			run += char;
		}
	}
	return result + run.toLowerCase().toUpperCase();
};

// Labels that cmark folds alike must share a key: a scalar and its cmark fold,
// such as `ß` and `ss`, must have the same key.
let mismatches = 0;
for (const char of changed) {
	if (key(char) !== runKey(fold(char))) {
		mismatches += 1;
	}
}
console.log('mismatches', mismatches);

// Labels that cmark folds apart must have different keys.
const classes = new Map<string, string>();
let collisions = 0;
for (const char of changed) {
	const value = fold(char);
	const charKey = key(char);
	if (classes.has(charKey) && classes.get(charKey) !== value) {
		collisions += 1;
	} else {
		classes.set(charKey, value);
	}
}
console.log('collisions', collisions);

// Case mapping can depend on neighbors, such as a final sigma.
let interactions = 0;
for (const a of changed) {
	for (const b of ['̇', 'ͅ', 'Σ', 'I', 'ı', 'ß', 'a']) {
		if (runKey(a + b) !== key(a) + key(b) || runKey(b + a) !== key(b) + key(a)) {
			interactions += 1;
		}
	}
}
console.log('interactions', interactions);
