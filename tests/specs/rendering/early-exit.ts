import { describe, test, expect } from 'manten';
import { lexBlocks } from '../../../src/block/index.ts';
import { rendered } from '../../utils/rendered.ts';

// The block phase stops after the last `<!--` once nothing pending can change
// a comment. These cases pin down the conditions that keep it from stopping
// too early: later text can still define a reference or a footnote, and an
// open comment or attribute needs a later line to end.
describe('early stop after the last comment opener', () => {
	test('the stopped phase reads no range that spans lines', () => {
		// A stopped phase used to pass the rest of the source to `processLine`
		// as one line. These ranges are what the block phase reports, so an
		// interior line ending means a line contract was broken.
		const source = 'a <!-- x -->\n\nfirst tail line\nsecond tail line\nthird tail line\n';
		const ranges: Array<[start: number, end: number]> = [];
		lexBlocks(source, {
			text: (segments) => {
				for (let index = 0; index < segments.length; index += 2) {
					ranges.push([segments[index], segments[(index + 1)]]);
				}
			},
			html: (start, end) => ranges.push([start, end]),
			generated: () => {},
			wantsCode: () => false,
		}, {
			after: source.lastIndexOf('<!--'),
			canStop: () => true,
		});
		expect(ranges).toStrictEqual([[0, 12]]);
	});

	test('a later reference definition still resolves an earlier image', () => {
		// A resolved image renders its label as alt text, so the comment in
		// the label disappears. Without the definition it is literal text.
		expect(rendered('![<!-- a -->][r]\n\n[r]: /u\n')).toStrictEqual([]);
		expect(rendered('![<!-- a -->][r]\n')).toStrictEqual([[2, ' a ']]);
	});

	test('a footnote definition that holds the last `<!--` still renders', () => {
		// The definition continues after the last `<!--`, and its closer is on
		// a later line.
		expect(rendered('body [^a]\n\n[^a]: <!-- open\n    --> tail\n')).toStrictEqual([
			[17, ' open\n    ', {
				nextLinePrefix: '    ',
				onCommentLine: true,
			}],
		]);
	});

	test('an earlier footnote definition keeps the phase running', () => {
		// The definition is unreferenced up to the last `<!--`. A reference in
		// a later paragraph renders it, which replays its comment.
		expect(rendered('[^a]: A <!-- def -->\n\nbody <!-- last -->\n\nx <span> [^a]\n')).toStrictEqual([
			[8, ' def ', { nextLinePrefix: '    ' }],
			[27, ' last '],
		]);
	});

	test('an open footnote definition keeps the phase running', () => {
		// The definition's content is held, so the tokenizer is in the data
		// state while its comment is still open. A reference in a later
		// paragraph makes it render, and its closer is after the last `<!--`.
		expect(rendered('body\n\n[^a]: <!-- open\n    --> tail\n\nlater [^a]\n')).toStrictEqual([
			[12, ' open\n    ', {
				nextLinePrefix: '    ',
				onCommentLine: true,
			}],
		]);
	});

	test('an unclosed tag or attribute before the last `<!--` keeps reading', () => {
		expect(rendered('<div title="\n<!-- not a comment -->\n">\n<!-- a\n--> b\n')).toStrictEqual([
			[39, ' a\n', { onCommentLine: true }],
		]);
	});

	test('a tag or attribute opened after the last comment does not change it', () => {
		// The phase stops while the tokenizer is in an attribute value, because
		// no later text can start a comment or end the closed one.
		expect(rendered('<div>\n<!-- a --> <span title="\n\ntail\n\nmore\n')).toStrictEqual([
			[6, ' a ', { onCommentLine: true }],
		]);
		expect(rendered('<div title="<!-- x -->\n\ntail\n\nmore">\n')).toStrictEqual([]);
	});
});
