import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('GitHub rendering', () => {
	test('indented code holds no markers', () => {
		expect(rendered('    <!-- a -->old<!-- /a -->')).toStrictEqual([]);
	});

	test('a tab-indented line is code', () => {
		expect(rendered('\t<!-- a -->old<!-- /a -->')).toStrictEqual([]);
	});

	test('an escaped <!-- does not open a comment', () => {
		expect(rendered(String.raw`\<!-- note <!-- a -->old<!-- /a -->`)).toStrictEqual([
			[11, ' a '],
			[24, ' /a '],
		]);
	});

	test('a processing instruction block hides a marker until its >', () => {
		expect(rendered('<?x <!-- a -->old<!-- /a -->')).toStrictEqual([
			[17, ' /a '],
		]);
	});

	test('a declaration block hides a marker until its >', () => {
		expect(rendered('<!X x <!-- a -->old<!-- /a -->')).toStrictEqual([
			[19, ' /a '],
		]);
	});

	test('a bogus comment continues into the next HTML block', () => {
		expect(rendered('<div>\n<?x\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[24, ' /a '],
		]);
	});

	test('a paragraph between HTML blocks ends a bogus comment', () => {
		expect(rendered('<div>\n<?x\n\ntext\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[17, ' a ', { onCommentLine: true }],
			[30, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a link reference definition renders nothing', () => {
		expect(rendered('[x]: <!-- a -->\n\nold\n\n<!-- /a -->')).toStrictEqual([
			[22, ' /a ', { onCommentLine: true }],
		]);
	});

	test('text after a link reference definition is a paragraph', () => {
		expect(rendered('[x]: /url\ntext <!-- a -->old<!-- /a -->')).toStrictEqual([
			[15, ' a '],
			[28, ' /a '],
		]);
	});

	test('an underline after only definitions is paragraph text', () => {
		expect(rendered('[x]: /url\n===\n    <!-- a -->old<!-- /a -->')).toStrictEqual([
			[18, ' a '],
			[31, ' /a '],
		]);
	});

	test('a table drops body cells past its header', () => {
		expect(rendered('| a |\n| - |\n| x | <!-- a -->old<!-- /a --> |')).toStrictEqual([]);
	});

	test('a pipe after any backslash stays in its table cell', () => {
		expect(rendered('| a | b |\n| - | - |\n| `\\\\|<!-- a -->old<!-- /a -->` | x |')).toStrictEqual([]);
	});

	test('a reference label over 1,000 UTF-8 bytes is text', () => {
		expect(rendered(`[${'あ'.repeat(334)}]: /u "<!-- a -->old<!-- /a -->"`)).toStrictEqual([
			[342, ' a '],
			[355, ' /a '],
		]);
	});

	test('a run of more than 80 backticks is literal', () => {
		expect(rendered(`x ${'`'.repeat(81)}<!-- a -->old<!-- /a -->${'`'.repeat(81)}`)).toStrictEqual([
			[83, ' a '],
			[96, ' /a '],
		]);
	});

	test('a fence longer than 255 closes at 255', () => {
		expect(rendered(`${'~'.repeat(256)}\ncode\n${'~'.repeat(255)}\n${'~'.repeat(256)}\n<!-- a -->old<!-- /a -->\n${'~'.repeat(256)}`)).toStrictEqual([]);
	});

	test('NUL does not end an autolink', () => {
		expect(rendered('x <ab:\u0000`y> <!-- a -->old<!-- /a --> `')).toStrictEqual([
			[11, ' a '],
			[24, ' /a '],
		]);
	});

	test('a filtered tag is text', () => {
		expect(rendered('<div>\n<title a="\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[18, ' a ', { onCommentLine: true }],
			[31, ' /a ', { onCommentLine: true }],
		]);
	});

	test('an open attribute value continues into the next HTML block', () => {
		expect(rendered('<div>\n<span a="\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([]);
	});

	test('noscript content contains comments', () => {
		expect(rendered('<noscript><!-- a -->old<!-- /a --></noscript>')).toStrictEqual([
			[10, ' a '],
			[23, ' /a '],
		]);
	});

	test('a comment-like line inside an attribute does not start the line', () => {
		expect(rendered('<pre>\n<span title="\n    <!-- note -->">Value: <!-- a -->old<!-- /a -->!</span>\n</pre>')).toStrictEqual([
			[46, ' a '],
			[59, ' /a '],
		]);
	});

	test('an indented comment on an HTML block line starts its line', () => {
		expect(rendered('<div>\n\t<!-- a -->old<!-- /a -->\n</div>')).toStrictEqual([
			[7, ' a ', { onCommentLine: true }],
			[20, ' /a ', { onCommentLine: true }],
		]);
	});
});
