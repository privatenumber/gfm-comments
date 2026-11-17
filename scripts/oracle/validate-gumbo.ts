/**
 * Checks the patched gumbo element stack reference against the cases with
 * known GitHub results: the probe fixtures and the inputs of the foreign
 * content tests. The scanner matches GitHub on all of them, so each case
 * compares the scanner's comments with those of cmark-gfm plus the patched
 * gumbo. Every disagreement must have a recorded reason below.
 *
 * Usage: node scripts/oracle/validate-gumbo.ts
 */
import fs from 'node:fs';
import module from 'node:module';
import {
	commentNodes, gumboCommentNodes, loadScanner, nodeLabels, render, scannerLabels,
} from './oracle.ts';

type Probe = {
	id: string;
	input: string;
};

const probes: Probe[] = JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/github-probes.json', import.meta.url), 'utf8'));

// Collects the input of every `rendered()` call in the foreign content tests
// by loading them with stand-ins for manten and the helper.
const inputs = new Set<string>();
(globalThis as { recordInput?: (source: string) => [] }).recordInput = (source) => {
	inputs.add(source);
	return [];
};
const stub = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const stubs: Record<string, string> = {
	manten: stub('export const describe = (_, f) => f(); export const test = describe; export const expect = () => new Proxy({}, { get: () => () => {} });'),
	'../../utils/rendered.ts': stub('export const rendered = source => globalThis.recordInput(source);'),
};
// registerHooks is a release candidate in Node 26, which this repository pins.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const hooks = module.registerHooks({
	resolve: (specifier, context, nextResolve) => (Object.hasOwn(stubs, specifier)
		? {
			url: stubs[specifier],
			shortCircuit: true,
		}
		: nextResolve(specifier, context)),
});
await import('../../tests/specs/rendering/foreign-content.ts');
hooks.deregister();

const cases = [
	...probes.map(({ id, input }) => ({
		id,
		input,
	})),
	...[...inputs].map((input, index) => ({
		id: `foreign-content-${index + 1}`,
		input,
	})),
];

// The reason for each recorded difference, by case. None is in the patched
// gumbo: in each, parse5 reads cmark-gfm's HTML as gumbo does.
const renderer = 'cmark-gfm 0.29.0.gfm.13';
const taskList = `${renderer} writes a checkbox with quotes, which end the open attribute value; GitHub's task list does not (github-oracle.md#task-list-checkbox-and-attribute-boundary)`;
const reasons: Record<string, string> = {
	'task-attribute-checked': taskList,
	'task-attribute-unchecked': taskList,
	'task-svg-attribute-task': taskList,
	'task-select-task': `${renderer} writes an <input>, which closes the open select; GitHub writes no checkbox there (github-oracle.md#task-list-checkbox-and-attribute-boundary)`,
	'tight-list': 'a known scanner gap, the probe\'s `gap`; gumbo matches GitHub (github-oracle.md#tight-list-boundary)',
	'footnote-11': `the unclosed comment runs into the next footnote in ${renderer}'s output; the scanner reports it to the end, as compare.ts treats a comment that crosses a footnote`,
	'footnote-entity-caret-reference': `${renderer} truncates its output after &Hat; in a footnote reference (verification.md)`,
	'footnote-self-referencing-definition': `${renderer} truncates its output after &Hat; in a footnote reference (verification.md)`,
	'footnote-label-ends-at-inline': `GitHub ends the footnote label at an inner inline, and ${renderer} does not (verification.md)`,
};

const { findComments } = await loadScanner();
// batch.c separates documents with NUL. cmark-gfm replaces NUL with U+FFFD
// as it reads its input, so replacing it first renders the same HTML.
const htmls = render(cases.map(({ input }) => input.replaceAll('\0', '�')));
const gumbo = gumboCommentNodes(htmls);

let unexplained = 0;
const rows: Record<string, string>[] = [];
for (const [index, { id, input }] of cases.entries()) {
	const scanner = scannerLabels(input, findComments(input)).sort();
	const reference = nodeLabels(gumbo[index]).sort();
	if (JSON.stringify(scanner) === JSON.stringify(reference)) {
		continue;
	}
	const parse5 = nodeLabels(commentNodes(htmls[index])).sort();
	const reason = Object.hasOwn(reasons, id) ? reasons[id] : undefined;
	unexplained += reason ? 0 : 1;
	rows.push({
		id,
		input: JSON.stringify(input).slice(0, 90),
		scanner: JSON.stringify(scanner),
		gumbo: JSON.stringify(reference),
		parse5: JSON.stringify(parse5) === JSON.stringify(reference) ? 'same as gumbo' : JSON.stringify(parse5),
		reason: reason ?? 'UNEXPLAINED',
	});
}

console.log(`${cases.length} cases (${probes.length} probe fixtures, ${inputs.size} foreign content test inputs): ${cases.length - rows.length} agree, ${rows.length} disagree, ${unexplained} unexplained`);
for (const row of rows) {
	console.log(`\n${row.id} ${row.input}\n  scanner ${row.scanner}\n  gumbo   ${row.gumbo}\n  parse5  ${row.parse5}\n  reason  ${row.reason}`);
}
if (unexplained > 0) {
	process.exitCode = 1;
}
