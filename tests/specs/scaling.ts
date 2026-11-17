import { describe, test, expect } from 'manten';
import { findComments } from '../../src/index.ts';
import { lexBlocks } from '../../src/block/index.ts';
import { contents } from '../utils/rendered.ts';

const time = (source: string, iterations: number) => {
	const start = performance.now();
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		findComments(source);
	}
	return (performance.now() - start) / iterations;
};

/**
 * Returns the best time in milliseconds of one scan of each source. A sample
 * repeats the scan until the first source takes about 5 ms, so the timer's
 * resolution and short pauses stay small against it. The sources alternate in
 * each round, in reverse order every other round, so a change in machine load
 * or a garbage collection affects them alike. There are 3 to 10 rounds, and
 * no new round starts after 0.5 seconds.
 */
const bestTimes = (sources: string[]) => {
	// The first scan gives the JIT compiler time to optimize. A slow first scan
	// of another source loses to its later samples.
	time(sources[0], 1);
	const iterations = Math.ceil(5 / Math.max(time(sources[0], 1), 0.01));
	const best = sources.map(() => Infinity);
	const deadline = performance.now() + 500;
	for (let round = 0; round < 10 && (round < 3 || performance.now() < deadline); round += 1) {
		for (let step = 0; step < sources.length; step += 1) {
			const index = round % 2 === 0 ? step : sources.length - 1 - step;
			best[index] = Math.min(best[index], time(sources[index], iterations));
		}
	}
	return best;
};

// Load from other processes can slow one source's samples enough to fail a
// timing ratio now and then. A superlinear regression fails every attempt,
// while load noise rarely fails three in a row, so ratio tests retry.
const timing = { retry: 3 };

// The block phase stops after the last `<!--` once nothing pending can change
// a comment, so each measured payload ends with a comment or shares a
// paragraph with one. Otherwise a test can pass without reading its payload.
describe('scaling', () => {
	test('lexBlocks skips code lines when wantsCode() is false', () => {
		// Retention changes only memory, so it has no public observable result.
		for (const content of [`\`\`\`\n${'x\n'.repeat(1000)}\`\`\`\n`, '    x\n'.repeat(1000)]) {
			lexBlocks(content, {
				text: () => {},
				html: () => {},
				wantsCode: () => false,
				generated: (block) => {
					if (block.type === 'code') {
						expect(block.lines).toStrictEqual([]);
						expect(block.tabSpaces).toStrictEqual([]);
					}
				},
			});
		}
	});
	for (const [name, input] of [
		// No underscore closer has a matching opener.
		['unmatched delimiter openers', (n: number) => '*a '.repeat(n) + 'b_ '.repeat(n)],
		// Each match consumes only two characters from each long run.
		['long delimiter runs', (n: number) => `${'*'.repeat(n)}x${'*'.repeat(n)}`],
		// Every character starts a new delimiter run.
		['alternating delimiters', (n: number) => '*_'.repeat(n)],
	] as const) {
		test(`${name} scale linearly`, () => {
			const content = (size: number) => `x <svg/> <!-- a --> ${input(size)}`;
			const [small, large] = bestTimes([content(3000), content(6000)]);
			expect(large / small).toBeLessThan(3.2);
		}, timing);
	}

	test('short table rows scale with source size', () => {
		const content = (size: number) => `x [x] <svg> <!-- a -->\n\n${'|h'.repeat(size)}|\n${'|-'.repeat(size)}|\n${'| x |\n'.repeat(size)}`;
		const [small, large] = bestTimes([content(3000), content(6000)]);
		expect(large / small).toBeLessThan(3);
	}, timing);

	// A single-quoted value stays open through link, image, autolink, and
	// aligned cell markup, so all of it is rendered.
	for (const [name, input] of [
		['links, images, and autolinks', (n: number) => `${'[x](/u) ![x](/u) www.x.y <http://x> [x][r] '.repeat(n)}\n\n[r]: /u`],
		['links in an unclosed bracket', (n: number) => `[${'[x](/u "t") '.repeat(n)}`],
		['paragraphs of links without raw HTML', (n: number) => `${'[x][r] www.x.y\n\n'.repeat(n)}[r]: /u`],
		['short rows of an aligned table', (n: number) => `${'|h'.repeat(n)}|\n${'|:-'.repeat(n)}|\n${'| x |\n'.repeat(n)}`],
	] as const) {
		test(`${name} in an open attribute value scale linearly`, () => {
			const content = (size: number) => `<!-- a --><a title='\n\n${input(size)}\n\n<!-- z -->`;
			const [small, large] = bestTimes([content(3000), content(6000)]);
			expect(large / small).toBeLessThan(3.2);
		}, timing);
	}

	// The numbered backlinks grow as n log n characters for n references, too
	// slowly for a doubling ratio to show, so the test compares the same
	// references with the attribute closed, where the tail is not read.
	test('footnote backlinks in an open attribute value cost no more than closed', () => {
		const base = `${'[^a] '.repeat(40_000)}\n\n[^a]: <div title='`;
		const [open, closed] = bestTimes([`${base}\n\n<!-- x -->`, `${base}'>\n\n<!-- x -->`]);
		expect(open / closed).toBeLessThan(1.5);
	}, timing);

	test('long tag hash collisions preserve exact nearest matches', () => {
		const prefix = 'a'.repeat(16_400);
		const a = `${prefix}0015zx`;
		const b = `${prefix}00cpcd`;
		const marker = '<!-- x -->value<!-- /x -->';
		const content = `<!-- a -->\n<div>\n<${a}><svg><${a}></${a}></${b}><![CDATA[ > ${marker} ]]></${a}><![CDATA[ > ${marker} ]]><${b}></${b}><${b}></${b}>`;
		// The first marker is CDATA text inside `svg`. The second follows the end
		// tag that closes `svg`, so its `<![CDATA[` is a bogus comment that ends at `>`.
		const second = content.lastIndexOf(marker);
		const starts = findComments(content).map(comment => comment.start);
		expect(starts).toStrictEqual([0, second, second + 15]);
	});

	test('closing a one-chunk name keeps a longer open name that extends it', () => {
		// GitHub /markdown, 2026-11-17: at 16,383 characters, `a` is
		// one whole chunk and `b` continues below it. `</b>` still closes `b` and
		// the `svg` inside it, so the marker after it is a comment.
		for (const length of [16_382, 16_383, 16_384]) {
			const a = 'a'.repeat(length);
			const b = `${a}b`;
			const content = `<div>\n<${b}><svg><${a}></${a}></${b}><![CDATA[ > <!-- marker --> VISIBLE ]]></div>`;
			expect(findComments(content).map(comment => content.slice(comment.start, comment.end))).toStrictEqual(['<!-- marker -->']);
		}
	});

	test('long colliding tag names scale linearly', () => {
		const pairs = [['0015zx', '00cpcd'], ...Array.from({ length: 10 }, (_, index) => (index % 2 ? ['0035zx', '00apcd'] : ['0053zx', '00cpad']))];
		const prefix = 'a'.repeat(16_400);
		const content = (size: number) => `<!-- a -->\n<div>\n<svg/>\n${Array.from({ length: size }, (_, index) => `<${prefix}${pairs.map((pair, bit) => pair[Math.floor(index / 2 ** bit) % 2]).join('')}>`).join('')}\n<!-- z -->`;
		// Four times the names separate a quadratic stack from a linear one more
		// than twice as many, for a similar run time.
		const [small, large] = bestTimes([content(512), content(2048)]);
		expect(large / small).toBeLessThan(5.2);
	}, timing);

	test('long distinct tag names scale linearly', () => {
		const prefix = 'a'.repeat(16_400);
		const content = (size: number) => `<!-- a -->\n<div>\n<svg/>\n${Array.from({ length: size }, (_, index) => `<${prefix}${String(index).padStart(5, '0')}>`).join('\n')}\n<!-- z -->`;
		// Four times the names separate a quadratic stack from a linear one more
		// than twice as many, for a similar run time.
		const [small, large] = bestTimes([content(512), content(2048)]);
		expect(large / small).toBeLessThan(5.2);
	}, timing);

	test('foreign content scans scale linearly', () => {
		for (const input of [
			(n: number) => '<svg>'.repeat(n) + '</svg>'.repeat(n),
			(n: number) => '<svg>'.repeat(n),
			(n: number) => '<svg>'.repeat(n) + '</missing>'.repeat(n),
			// A native terminator search is much faster than the other cases, so this
			// input is larger to keep its timing above runner noise.
			(n: number) => `<svg>${'<![CDATA['.repeat(n * 400)}`,
			(n: number) => 'x <svg>\n\ntext\n\n'.repeat(n),
		]) {
			const content = (size: number) => `<!-- a -->${input(size)}\n\n<!-- z -->`;
			const [small, large] = bestTimes([content(50_000), content(100_000)]);
			expect(large / small).toBeLessThan(3);
		}
	}, timing);

	test('unmatched heading end tags do not repeatedly search foreign headings', () => {
		const headings = '<h2><h3><h4><h5><h6>';
		const content = (tags: string) => `<div>\n<svg>${tags}${'</h1>'.repeat(200_000)}<!-- x -->`;
		const few = content(`${headings}${'<ab>'.repeat(19_995)}`);
		const many = content(headings.repeat(4000));
		expect(findComments(many).map(comment => many.slice(comment.contentStart, comment.contentEnd))).toStrictEqual([' x ']);
		// The inputs have the same length and stack depth. One has five foreign
		// headings, the other 20,000, so an end tag must cost about the same.
		const [fewTime, manyTime] = bestTimes([few, many]);
		expect(manyTime / fewTime).toBeLessThan(1.35);
	}, timing);

	// Each line opens 99 containers inside the ones that its indent continues,
	// and every blank line after them continues them all.
	test('blank lines in deeply nested containers scale linearly', () => {
		for (const [indent, opener, blank] of [
			// A footnote definition continues only on an empty line.
			['    ', '[^a]: ', ''],
			// A list item with a child continues on any blank line.
			['  ', '- ', ''],
			['  ', '- ', ' '],
		]) {
			const content = (size: number) => {
				const nested = Array.from({ length: size }, (_, index) => `${indent.repeat(index * 99)}${opener.repeat(99)}x`).join('\n');
				return `${nested}${`\n${blank}`.repeat(198 * (size ** 2))}\n<!-- a -->`;
			};
			// The source grows about four times.
			const [small, large] = bestTimes([content(8), content(16)]);
			expect(large / small).toBeLessThan(6);
		}
	}, timing);

	test('scans many unterminated openers without rescanning', () => {
		// A document with a long run of `<!--` and no `-->` must not trigger a
		// terminator search at every opener.
		// The first `<!--` opens an HTML block and a comment that runs to the end.
		const content = '<!-- a '.repeat(50_000);
		expect(findComments(content)).toStrictEqual([{
			start: 0,
			end: content.length,
			contentStart: 4,
			contentEnd: content.length,
			nextLinePrefix: '',
			onCommentLine: true,
		}]);
	});

	test('parses adversarial backtick runs within a time budget', () => {
		// Every run length is unique, so no run finds a partner and each one is
		// literal text, which keeps span matching walking the whole line.
		const runs: string[] = [];
		for (let length = 1; length <= 2048; length += 1) {
			runs.push('`'.repeat(length));
		}
		const content = `${runs.join(' ')} <!-- x -->value<!-- /x -->`;

		const start = performance.now();
		const comments = contents(content);
		const elapsed = performance.now() - start;

		expect(comments).toStrictEqual([' x ', ' /x ']);
		expect(elapsed).toBeLessThan(1500);
	});

	test('finds many adjacent comments within a time budget', () => {
		const content = '<!-- a -->'.repeat(20_000) + '<!-- /b -->'.repeat(20_000);

		const start = performance.now();
		const comments = findComments(content);
		const elapsed = performance.now() - start;

		expect(comments.length).toBe(40_000);
		expect(elapsed).toBeLessThan(1500);
	});

	test('link tail and bracket scans scale linearly', () => {
		const inputs = [
			(n: number) => 'http: '.repeat(n),
			(n: number) => 'www. '.repeat(n),
			(n: number) => 'www._ '.repeat(n),
			(n: number) => '['.repeat(n) + '](a "'.repeat(n),
			(n: number) => '['.repeat(n) + "](a '".repeat(n),
			(n: number) => '['.repeat(n) + '](a ('.repeat(n),
			(n: number) => '['.repeat(n * 3) + '](a "](a \'](a ('.repeat(n),
			(n: number) => '['.repeat(n) + '](<'.repeat(n),
			(n: number) => '['.repeat(n) + '](a()'.repeat(n),
			(n: number) => '['.repeat(n) + '![ '.repeat(n) + ']('.repeat(n),
			(n: number) => '[[[['.repeat(n) + '[a](b)'.repeat(n),
		];
		for (const input of inputs) {
			const content = (size: number) => `x <!-- a --> ${input(size)}`;
			const [small, large] = bestTimes([content(5000), content(10_000)]);
			expect(large).toBeLessThan(small * 3 + 20);
		}
	}, timing);

	test('reference lookups scale linearly', () => {
		for (const input of [
			(n: number) => `${'[r] '.repeat(n)}\n\n${Array.from({ length: n }, (_, i) => `[r${i}]: /u\n`).join('')}[r]: /u`,
			(n: number) => '[undefined] '.repeat(n),
			(n: number) => `[${'a'.repeat(999)}] `.repeat(n),
		]) {
			const content = (size: number) => `x <!-- a --> ${input(size)}`;
			const [small, large] = bestTimes([content(1000), content(2000)]);
			expect(large).toBeLessThan(small * 3 + 20);
		}
	}, timing);

	test('footnotes scale linearly', () => {
		const definitions = (n: number, content: (i: number) => string) => Array.from({ length: n }, (_, i) => `[^${i}]: ${content(i)}\n\n`).join('');
		for (const input of [
			// Many definitions, referenced in order and in reverse order.
			(n: number) => `${Array.from({ length: n }, (_, i) => `[^${i}]`).join(' ')}\n\n${definitions(n, i => `<!-- ${i} -->`)}`,
			(n: number) => `${Array.from({ length: n }, (_, i) => `[^${n - 1 - i}]`).join(' ')}\n\n${definitions(n, i => `<!-- ${i} -->`)}`,
			// Many references to one definition, and many unreferenced definitions.
			(n: number) => `${'[^a] '.repeat(n)}\n\n[^a]: <!-- a -->`,
			(n: number) => definitions(n, i => `<!-- ${i} -->`),
			// Comments and attributes left open in every definition.
			(n: number) => `${Array.from({ length: n }, (_, i) => `[^${n - 1 - i}]`).join(' ')}\n\n${definitions(n, () => '<!-- open')}`,
			(n: number) => `${Array.from({ length: n }, (_, i) => `[^${n - 1 - i}]`).join(' ')}\n\n${definitions(n, () => '<div title="')}`,
			// Many comments and attributes in one definition, where the losing
			// closer searches must not each read to the end of the line.
			(n: number) => `[^a]\n\n[^a]: ${'<!-- a --><b title="a">'.repeat(n)}`,
			(n: number) => `[^a]\n\n[^a]: <div>\n${'<!-- a --><b title=\'a\'>\n'.repeat(n)}`,
			// Nested brackets that may each become a reference.
			(n: number) => `${'[^'.repeat(n)}a${']'.repeat(n)}\n\n[^a]: A`,
			(n: number) => `${'[^a`b` '.repeat(n)}${']'.repeat(n)}\n\n[^a]: A`,
		]) {
			const content = (size: number) => `x <!-- a --> ${input(size)}`;
			// The ranges stay in source order and disjoint.
			const comments = findComments(content(1000));
			expect(comments.every(
				(comment, index) => index === 0 || comment.start >= comments[index - 1].end,
			)).toBe(true);
			const [small, large] = bestTimes([content(5000), content(10_000)]);
			expect(large / small).toBeLessThan(3);
		}
	}, timing);

	test('reference expansion slow path scales near linearly', () => {
		// The first paragraph holds `<`, `[`, and `]`, so events are buffered
		// and the budget's second block pass runs.
		const content = (count: number) => `x [r] <!-- a -->old<!-- /a -->\n\n${'[r] x\n\n'.repeat(count)}[r]: ${'u'.repeat(1000)}\n`;
		const [small, large] = bestTimes([content(4000), content(8000)]);
		expect(large / small).toBeLessThan(3);
	}, timing);

	test('reference expansion counts NUL input bytes before replacement for the cap', () => {
		const prefix = '[r] '.repeat(103);
		const source = `\`\`\`\n${'\0'.repeat(102_000)}\n\`\`\`\n\n${prefix}![<!-- a -->old][r] <!-- /a -->\n\n`
			+ `[r]: ${'u'.repeat(1000)}`;
		expect(contents(source)).toStrictEqual([' a ', ' /a ']);
	});
});
