import { defineConfig, pvtnbr } from 'lintroll';

// `src/` scans by character index instead of with regular expressions.
//
// Overlapping patterns and the scan position a global or sticky regex carries
// make a scanner hard to reason about: pattern-based block rules hide the order
// the scanner reads in. An explicit scan keeps that order and its state
// visible. Performance is not a reason to reintroduce patterns: if an
// index-based scan is too slow, make that scan faster.
//
// These rules cover `src/` only; tests may still use regular expressions in
// assertions. `pnpm lint` runs in CI, so a config that fails to load fails the
// build instead of silently dropping the ban.
const scanByIndex = 'Scan by character index with scan-local state.';

export default defineConfig([
	...pvtnbr(),
	{
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'Literal[regex]',
					message: `A regular expression literal is not allowed in src/. ${scanByIndex}`,
				},
				{
					selector: 'CallExpression[callee.name="RegExp"], NewExpression[callee.name="RegExp"]',
					message: `Constructing a RegExp is not allowed in src/. ${scanByIndex}`,
				},
				{
					selector: 'MemberExpression[property.name="match"]',
					message: `String#match coerces its argument to a regular expression. ${scanByIndex}`,
				},
				{
					selector: 'MemberExpression[property.name="matchAll"]',
					message: `String#matchAll coerces its argument to a regular expression. ${scanByIndex}`,
				},
				{
					selector: 'MemberExpression[property.name="search"]',
					message: `String#search coerces its argument to a regular expression. ${scanByIndex}`,
				},
			],
		},
	},
	{
		// The scanner compares UTF-16 code units with ASCII codes, where
		// `charCodeAt` and `codePointAt` agree. Past the end of the text,
		// `charCodeAt` returns NaN, which matches no code, while `codePointAt`
		// returns undefined, which every numeric read would have to guard.
		files: ['src/**/*.ts'],
		rules: {
			'unicorn/prefer-code-point': 'off',
		},
	},
	{
		// utils/ holds generic primitives, so it never depends on the scanner.
		files: ['src/utils/**/*.ts'],
		rules: {
			'import-x/no-restricted-paths': ['error', {
				zones: [{
					target: './src/utils',
					from: './src',
					except: ['./utils'],
					message: 'utils/ imports only built-ins and other utils/ modules.',
				}],
			}],
		},
	},
]);
