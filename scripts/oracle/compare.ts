/**
 * Compares the scanner's comments with the oracle's on generated documents,
 * and checks the invariants of the reported ranges.
 *
 * Usage: node scripts/oracle/compare.ts [options]
 *   --count <n>       documents per run (default 20000)
 *   --seed <n>        repeatable (default 7, 11, and 23)
 *   --set <name>      fragment set, repeatable (default every set)
 *   --scanner <file>  a src/index.ts to compare instead of this
 *                     checkout's, such as a baseline
 *   --show <n>        shortest mismatches and violations to print per run
 *                     (default 5)
 *   --approach <name> what to grade against the oracle: `scanner` (default),
 *                     `regex` for /<!--[\s\S]*?-->/g, or `micromark` for
 *                     micromark's HTML parsed with parse5, which has no
 *                     source ranges to check
 *
 * The comparator rules are explained in notes/gfm-comments/github-oracle.md.
 */
import { parseArgs } from 'node:util';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import type { lexBlocks as LexBlocks } from '../../src/block/index.ts';
import {
	closerKind, commentNodes, createRandom, label, loadScanner, render, type Kind,
} from './oracle.ts';

const fragmentSets: Record<string, string[]> = {
	foreign: ['<svg>', '</svg>', '<math>', '<![CDATA[', ']]>', '>', '</p>', '<p>', '- ', '> ', '</ul>', '</li>', '</h1>', '# ', '*', '| a |\n| - |\n| ', '<!-- a -->', '<!-- /a -->', 'x', ' ', '\n', '\n\n', '<div>\n'],
	tables: ['| x |\n| - |\n| ', ' |', String.raw`\|`, '<!-- a -->', '<!-- /a -->', '`', String.raw`[x][r\|s]`, `\n\n${String.raw`[r\|s]: /u`}\n`, ' ', '\n', 'x', '<a title="', '">'],
	refs: ['[', ']', '][', '[]', ']: /u\n', '\n\n[r]: /u\n', '[r]', '[R]', 'r', ' ', '\n', 'x <!-- a -->', 'x <!-- /a -->', '<!--', '-->', '!'],
	links: ['[', '![', ']', '](', ')', '(', '<', '>', '"', '\'', ' ', '\n', '`', '\\', 'x <!-- a -->', 'x <!-- /a -->', '<!--', '-->', 'u', '<u>', '"t"', '[x](', '![x](', '[x', '![x', '<!-- a -->', '<!-- /a -->'],
	autolink: ['x <!-- a -->', 'x <!-- /a -->', '<!--', '-->', '<', '>', '`', ' ', '\n', 'http', 'a', 'ab', ':', '@', '.', '-', 'b.c', 'x@', 'a.b-c', '<a@b.c>', '<http://x>', '<mailto:', '\\', '_', '+', 'a'.repeat(31), 'a'.repeat(63), '<a', '"', '=', '<!X', '<?', '<http://`', '<a`b@c.d>', '`', '``', '<ab:`>', '<a`@b>'],
	footnotes: ['[^', '[^a]', '[^b]', '[^a', ']', '[', '\n\n[^a]: ', '\n\n[^b]: ', '\n    ', '\n', '\n\n', ' ', 'x', 'x <!-- a -->', 'x <!-- /a -->', '<!--', '-->', '<!-- a -->', '<!-- /a -->', '`', '- ', '> ', '\n<div>\n', '<a title="', '">', String.raw`\^`, '&Hat;', '![', '](u)', '*', '[r]', '\n\n[r]: /u\n', '\n```\n', '\t', 'b'],
	rich: ['x <!-- a -->', 'x <!-- /a -->', '<!-- a -->', '<!--', '-->', '<!-->', '<!--->', ' --->', '\n', '\n', '\n\n', ' ', 'text', '`', '``', '\n```\n', '\n~~~\n', '\n    ', '  ', '> ', '- ', '1. ', '2. ', '| - |', '|', '# ', '\n===\n', '\n---\n', '\n***\n', '\\', '<div>', '\n<div>\n', '<span>', '\n<span>\n', '<pre>', '</pre>', '<?x', '?>', '<!X', '>', '<a title="', '">', '\t', '[x]: ', '&lt;'],
};

const { values } = parseArgs({
	options: {
		count: {
			type: 'string',
			default: '20000',
		},
		seed: {
			type: 'string',
			multiple: true,
			default: ['7', '11', '23'],
		},
		set: {
			type: 'string',
			multiple: true,
			default: Object.keys(fragmentSets),
		},
		scanner: { type: 'string' },
		approach: {
			type: 'string',
			default: 'scanner',
		},
		show: {
			type: 'string',
			default: '5',
		},
	},
});

for (const name of values.set) {
	if (!Object.hasOwn(fragmentSets, name)) {
		throw new Error(`Unknown fragment set ${name}. Sets: ${Object.keys(fragmentSets).join(', ')}`);
	}
}

const approaches = ['scanner', 'regex', 'micromark'];
if (!approaches.includes(values.approach)) {
	throw new Error(`Unknown approach ${values.approach}. Approaches: ${approaches.join(', ')}`);
}

const scanner = await loadScanner(values.scanner);
const scanRanges = values.approach === 'regex'
	? (source: string): Range[] => [...source.matchAll(/<!--[\s\S]*?-->/g)].map((match) => {
		const end = match.index + match[0].length;
		return [match.index, match.index + 4, end - 3, end];
	})
	: (values.approach === 'micromark'
		? (): Range[] => []
		: (source: string): Range[] => scanner.findComments(source).map(({
			start, contentStart, contentEnd, end,
		}) => [start, contentStart, contentEnd, end]));

// The block phase reports where footnote definitions start and end, for the
// invariant that no range crosses a rendered definition. A baseline scanner
// without this API skips that check.
type BlockModule = { lexBlocks?: typeof LexBlocks };
const { lexBlocks } = await import(new URL('block/index.ts', scanner.url).href).catch(() => ({})) as BlockModule;
if (!lexBlocks) {
	console.log('No block/index.ts beside the scanner: skipping the footnote definition check');
}

const generate = (fragments: string[], count: number, seed: number) => {
	const random = createRandom(seed);
	const documents: string[] = [];
	for (let i = 0; i < count; i += 1) {
		let document = '';
		let marker = 0;
		const length = 2 + random(14);
		for (let j = 0; j < length; j += 1) {
			const fragment = fragments[random(fragments.length)];
			if (fragment === '<!--') {
				marker += 1;
				document += `<!--o${marker}q`;
			} else {
				document += fragment;
			}
		}
		documents.push(document.replaceAll(/(<!-- \/?a)( -->)/g, (_, open: string, close: string) => {
			marker += 1;
			return `${open}${marker}${close}`;
		}));
	}
	return documents;
};

const footnoteList = '<section class="footnotes" data-footnotes>';

const oracleComments = (html: string) => commentNodes(html).map(({ data, raw }): string => {
	// A comment that runs from one render stream into another, such as from
	// the body into the footnotes or between two footnotes, has no source
	// range. The scanner reports it as running to the end.
	const crosses = raw.includes(footnoteList) || raw.includes('<li id="fn-');
	return label(data, crosses ? 'eof' : closerKind(raw));
});

type Range = [start: number, contentStart: number, contentEnd: number, end: number];

type Definition = {
	label: string;
	start: number;
	end: number;
};

// cmark-gfm writes a definition's raw label into its `id` with
// houdini_escape_href (houdini_href_e.c). The escape is not reversible, as `%`
// passes through unescaped, so the labels are encoded instead of the ids
// decoded.
const hrefSafe = /^[\w!#$%()*+,\-./:;=?@~]$/;
const escapeHref = (text: string) => Array.from(Buffer.from(text), (byte) => {
	const char = String.fromCodePoint(byte);
	if (byte < 128 && hrefSafe.test(char)) {
		return char;
	}
	if (char === '&') {
		return '&amp;';
	}
	if (char === '\'') {
		return '&#x27;';
	}
	return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}).join('');

// The source ranges of the footnote definitions that the oracle renders, and
// the number of rendered definitions that no source definition matched.
const renderedDefinitions = (document: string, html: string) => {
	const open: Omit<Definition, 'end'>[] = [];
	const definitions: Definition[] = [];
	lexBlocks!(document, {
		text: () => {},
		html: () => {},
		generated: () => {},
		wantsCode: () => false,
		footnoteStart: (definitionLabel, start) => {
			open.push({
				label: definitionLabel,
				start,
			});
		},
		footnoteEnd: (_lastIsParagraph, _markup, end) => {
			definitions.push({
				...open.pop()!,
				end,
			});
		},
	});
	const ids = new Set(Array.from(html.matchAll(/<li id="fn-([^"]*)">/g), match => match[1]));
	const matched = new Set<string>();
	const seen = new Set<string>();
	const rendered = definitions.filter((definition) => {
		// The first definition of a label wins, and its raw label is the id.
		const definitionKey = definition.label.toUpperCase();
		if (seen.has(definitionKey)) {
			return false;
		}
		seen.add(definitionKey);
		const id = escapeHref(definition.label);
		matched.add(id);
		return ids.has(id);
	});
	return {
		definitions: rendered,
		unmatched: ids.difference(matched).size,
	};
};

const crossings = (definitions: Definition[], ranges: Range[]) => {
	const problems: string[] = [];
	for (const definition of definitions) {
		for (const boundary of [definition.start, definition.end]) {
			for (const range of ranges) {
				if (range[0] < boundary && boundary < range[3]) {
					problems.push(`[${range[0]}, ${range[3]}) crosses definition boundary ${boundary}`);
				}
			}
		}
	}
	return problems;
};

// Reported ranges are in source order and disjoint, their offsets are
// ordered, and none crosses the start or end of a rendered definition.
const invariantViolations = (document: string, ranges: Range[], definitions: Definition[]) => {
	const problems: string[] = [];
	for (const [index, [start, contentStart, contentEnd, end]] of ranges.entries()) {
		if (contentStart !== start + 4) {
			problems.push(`contentStart ${contentStart} is not start ${start} + 4`);
		}
		if (!(contentStart <= contentEnd && contentEnd <= end && end <= document.length)) {
			problems.push(`offsets out of order: ${contentStart} ${contentEnd} ${end} ${document.length}`);
		}
		if (index > 0 && start < ranges[index - 1][3]) {
			problems.push(`range ${index} starts at ${start}, before the previous end ${ranges[index - 1][3]}`);
		}
	}
	problems.push(...crossings(definitions, ranges));
	return problems;
};

const scannerComments = (document: string, ranges: Range[]) => ranges.map(
	([start, contentStart, contentEnd, end]) => {
		// A comment with no closer before the end stops at a footnote
		// definition that the renderer moves. The oracle's comment has its
		// rendered closer instead, so only the opening compares.
		const kind: Kind = contentEnd === end
			? (end === document.length ? 'eof' : 'clip')
			: closerKind(document.slice(start, end));
		return label(document.slice(contentStart, contentEnd), kind);
	},
);

// A clipped comment matches the oracle comment with the same opening.
const matchClipped = (actual: string[], expected: string[]) => {
	for (const clipped of actual) {
		if (clipped.startsWith('clip:')) {
			const opening = clipped.slice(5);
			const match = expected.findIndex(other => other.slice(other.indexOf(':') + 1).split('|')[0] === opening);
			if (match !== -1) {
				expected[match] = clipped;
			}
		}
	}
};

type Failure = [document: string, detail: string];

const compare = (documents: string[]) => {
	const htmls = render(documents);
	const mismatches: Failure[] = [];
	const violations: Failure[] = [];
	let errors = 0;
	let unmatched = 0;
	for (const [index, document] of documents.entries()) {
		let ranges: Range[];
		try {
			ranges = scanRanges(document);
		} catch (error) {
			errors += 1;
			mismatches.push([document, `THROWS ${(error as Error).message}`]);
			continue;
		}

		const footnotes = lexBlocks && document.includes('[^')
			? renderedDefinitions(document, htmls[index])
			: undefined;
		unmatched += footnotes?.unmatched ?? 0;
		const problems = invariantViolations(document, ranges, footnotes?.definitions ?? []);
		if (problems.length > 0) {
			violations.push([document, `${problems.join('; ')} ${JSON.stringify(ranges)}`]);
		}

		const actual = values.approach === 'micromark'
			? oracleComments(micromark(document, {
				allowDangerousHtml: true,
				extensions: [gfm()],
				htmlExtensions: [gfmHtml()],
			}))
			: scannerComments(document, ranges);
		const expected = oracleComments(htmls[index]);
		matchClipped(actual, expected);
		// The renderer moves footnotes to the end, and the scanner reports in
		// source order, so with footnotes only the set of comments compares.
		if (htmls[index].includes(footnoteList)) {
			actual.sort();
			expected.sort();
		}
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			mismatches.push([document, JSON.stringify({
				actual,
				expected,
			})]);
		}
	}
	return {
		mismatches,
		violations,
		errors,
		unmatched,
	};
};

const show = Number(values.show);
const printShortest = (heading: string, failures: Failure[]) => {
	const shortest = failures.slice().sort((a, b) => a[0].length - b[0].length).slice(0, show);
	if (shortest.length > 0) {
		console.log(`  ${heading}:`);
	}
	for (const [document, detail] of shortest) {
		console.log(`    ${JSON.stringify(document)}`);
		console.log(`      ${detail.slice(0, 300)}`);
	}
};

const count = Number(values.count);
const summary: Record<string, Record<string, string>> = {};
let broken = false;
for (const name of values.set) {
	summary[name] = {};
	for (const seed of values.seed) {
		const documents = generate(fragmentSets[name], count, Number(seed));
		const {
			mismatches, violations, errors, unmatched,
		} = compare(documents);
		console.log(
			`${name} seed ${seed}: ${mismatches.length} mismatches, ${errors} errors,`,
			`${violations.length} invariant violations`,
		);
		if (unmatched > 0) {
			console.log(`  warning: ${unmatched} rendered footnote definitions matched no source definition, so the crossing check skipped them`);
		}
		printShortest('mismatches', mismatches);
		printShortest('invariant violations', violations);
		summary[name][`seed ${seed}`] = `${mismatches.length} / ${violations.length}`;
		broken ||= errors > 0 || violations.length > 0;
	}
}
console.log(`\n${count} documents per run; mismatches / invariant violations:`);
console.table(summary);
if (broken) {
	process.exitCode = 1;
}
