/**
 * Compares the scanner's comments with those of cmark-gfm plus the patched
 * gumbo on generated HTML blocks that exercise the element stack. A document
 * is `<div>\n` and random tags, with CDATA markers that hide a comment only
 * in SVG and MathML content. Each mismatch is reduced by dropping fragments
 * while it still mismatches, and equal reductions are counted together.
 *
 * Usage: node scripts/oracle/compare-stack.ts [options]
 *   --count <n>  documents per run (default 1000000)
 *   --seed <n>   repeatable (default 7, 11, and 23)
 *   --show <n>   reductions to print per run, most frequent first (default all)
 *
 * The output is deterministic, so the default run's output is the baseline:
 * a changed count or a new reduction is a new mismatch class. The patched
 * gumbo and the baseline are described in notes/gfm-comments/github-oracle.md.
 */
import { parseArgs } from 'node:util';
import {
	createRandom, gumboCommentNodes, loadScanner, nodeLabels, render, scannerLabels,
} from './oracle.ts';

const cdata = '<![CDATA[';
const fragments = ['<svg>', '</svg>', '<svg/>', '<math>', '</math>', '<foreignObject>', '</foreignObject>', '<desc>', '</desc>', '<title>', '</title>', '<mi>', '</mi>', '<mo>', '<mn>', '<ms>', '<mtext>', '</mtext>', '<annotation-xml>', '</annotation-xml>', '<mglyph>', '<select>', '</select>', '<table>', '</table>', '<tr>', '<td>', '</td>', '<caption>', '</caption>', '<p>', '</p>', '<li>', '</li>', '<dd>', '<dt>', '<h1>', '<h2>', '</h1>', '<button>', '</button>', '<object>', '</object>', '<template>', '</template>', '<noscript>', '</noscript>', '<a>', '</a>', '<b>', '</b>', '<nobr>', '</nobr>', '<form>', '</form>', '<div>', '</div>', '<span>', '</span>', '<br>', '</br>', '<input>', '<img>', '<hr>', '<isindex>', '<menuitem>', '<keygen>', '<param>', '<image>', '<font color=x>', cdata, cdata, cdata, 'x', '\n'];

const { values } = parseArgs({
	options: {
		count: {
			type: 'string',
			default: '1000000',
		},
		seed: {
			type: 'string',
			multiple: true,
			default: ['7', '11', '23'],
		},
		show: {
			type: 'string',
		},
	},
});

// Each document is a list of fragments, so a reduction can drop any of them.
// Each CDATA marker holds a comment with a unique number.
const generate = (count: number, seed: number) => {
	const random = createRandom(seed);
	const documents: string[][] = [];
	for (let i = 0; i < count; i += 1) {
		const parts: string[] = [];
		const length = 2 + random(14);
		for (let j = 0; j < length; j += 1) {
			const fragment = fragments[random(fragments.length)];
			parts.push(fragment === cdata ? `${cdata} > <!-- a${j} --> ]]>` : fragment);
		}
		documents.push(parts);
	}
	return documents;
};

const textOf = (parts: string[]) => `<div>\n${parts.join('')}`;

const { findComments } = await loadScanner();

type Result = {
	scanner: string[];
	gumbo: string[];
};

// The comments of each document on both sides, or undefined when they agree.
const mismatches = (documents: string[][]): (Result | undefined)[] => {
	const texts = documents.map(textOf);
	const gumbo = gumboCommentNodes(render(texts));
	return texts.map((text, index) => {
		const result = {
			scanner: scannerLabels(text, findComments(text)).sort(),
			gumbo: nodeLabels(gumbo[index]).sort(),
		};
		return JSON.stringify(result.scanner) === JSON.stringify(result.gumbo) ? undefined : result;
	});
};

// Drops one fragment from each document per round, the first whose removal
// keeps the mismatch, until no removal does. All candidates of a round render
// in one batch.
const reduce = (documents: string[][]) => {
	let current = documents;
	for (;;) {
		const candidates = current.flatMap((parts, owner) => parts.map((_, drop) => ({
			owner,
			parts: parts.toSpliced(drop, 1),
		})));
		const results = mismatches(candidates.map(candidate => candidate.parts));
		const next = current.slice();
		const reduced = new Set<number>();
		for (const [index, { owner, parts }] of candidates.entries()) {
			if (results[index] && !reduced.has(owner)) {
				next[owner] = parts;
				reduced.add(owner);
			}
		}
		if (reduced.size === 0) {
			return current;
		}
		current = next;
	}
};

const count = Number(values.count);
const show = values.show === undefined ? Infinity : Number(values.show);
const summary: Record<string, Record<string, number>> = {};
for (const seed of values.seed) {
	const documents = generate(count, Number(seed));
	const results = mismatches(documents);
	const failing = documents.filter((_, index) => results[index]);
	// Renumbering the markers in order lets equal reductions group.
	const reductions = Map.groupBy(reduce(failing).map((parts) => {
		let marker = 0;
		return textOf(parts).replaceAll(/<!-- a\d+ -->/g, () => {
			marker += 1;
			return `<!-- a${marker} -->`;
		});
	}), text => text);
	// Most frequent first, then shortest.
	const ranked = [...reductions].sort((a, b) => (
		b[1].length - a[1].length || a[0].length - b[0].length
	));
	console.log(`seed ${seed}: ${failing.length} mismatches, ${reductions.size} distinct reductions`);
	const shown = ranked.slice(0, show);
	const details = mismatches(shown.map(([text]) => [text.slice('<div>\n'.length)]));
	for (const [index, [text, group]] of shown.entries()) {
		console.log(`  ${group.length}x ${JSON.stringify(text)}`);
		console.log(`      ${JSON.stringify(details[index])}`);
	}
	summary[`seed ${seed}`] = {
		mismatches: failing.length,
		reductions: reductions.size,
	};
}
console.log(`\n${count} documents per run:`);
console.table(summary);
