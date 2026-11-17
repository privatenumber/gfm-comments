import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

// GitHub moves each referenced footnote definition to a list at the end of
// the document and drops the others. The GitHub probes behind these cases are
// in notes/gfm-comments/footnotes.md.
//
// A comment that starts a line of a definition is on an HTML block line, and
// the definition's next-line prefix is four spaces.
const block = {
	nextLinePrefix: '    ',
	onCommentLine: true,
};

describe('footnotes', () => {
	test('only referenced definitions render', () => {
		expect(rendered('x[^1]\n\n[^1]: <!-- a -->')).toStrictEqual([[13, ' a ', block]]);
		expect(rendered('[^1]: <!-- a -->')).toStrictEqual([]);
		expect(rendered('x [^a] y\n\n[^b]: <!-- b -->\n\n[^a]: <!-- a -->')).toStrictEqual([[34, ' a ', block]]);
		// The first definition of a label wins.
		expect(rendered('x[^a]\n\n[^a]: <!-- first -->\n\n[^a]: <!-- second -->')).toStrictEqual([[13, ' first ', block]]);
		// `[^]` and a label with a space are not definitions.
		expect(rendered('x [^]\n\n[^]: <!-- a -->')).toStrictEqual([]);
		expect(rendered('x [^ a]\n\n[^ a]: <!-- a -->')).toStrictEqual([]);
	});

	test('references count wherever they stay in the tree', () => {
		// A reference in an unreferenced definition still counts.
		expect(rendered('[^b]: [^a]\n\n[^a]: <!-- a -->')).toStrictEqual([[18, ' a ', block]]);
		// So does a reference in an image description.
		expect(rendered('![x [^a]](u)\n\n[^a]: <!-- a -->')).toStrictEqual([[20, ' a ', block]]);
		// An escaped caret and an entity also make references.
		expect(rendered('x [\\^a] [&Hat;b]\n\n[^a]: <!-- a -->\n\n[^b]: <!-- b -->')).toStrictEqual([
			[24, ' a ', block],
			[42, ' b ', block],
		]);
	});

	test('a reference drops the inlines in its brackets', () => {
		// Defined or not, the brackets render as a reference or as `[^]`.
		expect(rendered('x [^<!-- a -->VIS] y')).toStrictEqual([]);
		expect(rendered('x [^a<!-- a -->] y\n\n[^a]: A')).toStrictEqual([]);
	});

	test('a reference label ends at the first inline that is not text', () => {
		// Emphasis delimiters stay in the label, and escapes are decoded.
		expect(rendered('x [^a*b]\n\n[^a*b]: <!-- a -->')).toStrictEqual([[18, ' a ', block]]);
		expect(rendered('x [^a\\*b]\n\n[^a*b]: <!-- a -->')).toStrictEqual([[19, ' a ', block]]);
		// A line ending, a code span, and an inner reference end it.
		expect(rendered('x [^a\nb]\n\n[^a]: <!-- a -->')).toStrictEqual([[16, ' a ', block]]);
		expect(rendered('x [^a`b`]\n\n[^a]: <!-- a -->')).toStrictEqual([[17, ' a ', block]]);
		expect(rendered('x [^a[^b]c]\n\n[^a]: <!-- a -->\n\n[^b]: <!-- b -->')).toStrictEqual([[19, ' a ', block]]);
	});

	test('comments are reported in source order', () => {
		expect(rendered('x[^c][^b][^a]\n\n[^a]: <!-- a -->\n\n[^b]: <!-- b -->\n\n[^c]: <!-- c -->')).toStrictEqual([
			[21, ' a ', block],
			[39, ' b ', block],
			[57, ' c ', block],
		]);
		expect(rendered('x[^a][^a]\n\n[^a]: <!-- a -->')).toStrictEqual([[17, ' a ', block]]);
	});

	test('a comment that GitHub does not close in its stretch of source has no closer', () => {
		// The body's comment runs into the footnote list, to the end.
		expect(rendered('x[^a]\n\n[^a]: VISIBLE\n\n<!-- open')).toStrictEqual([[22, ' open', {
			closer: '',
			onCommentLine: true,
		}]]);
		// A comment left open in a footnote ends with its definition, before
		// the next line of the body.
		expect(rendered('x[^a]\n\n[^a]: A\n    <!-- open\n\nBODY <!-- z -->')).toStrictEqual([
			[19, ' open\n\n', {
				...block,
				closer: '',
			}],
			[35, ' z '],
		]);
		// On GitHub, the second footnote's comment ends in the first one's
		// comment, which renders after it. Its range ends with its definition.
		expect(rendered('x[^b][^a]\n\n[^a]: A1 <!-- c --> A2\n\n[^b]: B1\n    <!-- open\n\nBODY')).toStrictEqual([
			[48, ' open\n\n', {
				...block,
				closer: '',
			}],
		]);
	});

	test('a comment in the body ends at a definition that GitHub moves', () => {
		// The `-->` after the definition closes the comment on GitHub, but the
		// definition's text between them renders at the end.
		expect(rendered('<div>\n<!-- open\n\n[^a]: <!-- in -->\n\n<div>\n-->\n\nx[^a]')).toStrictEqual([
			[6, ' open\n\n', {
				closer: '',
				onCommentLine: true,
			}],
			[23, ' in ', block],
		]);
		expect(rendered('<div>\n<!-- open\n\n[^a]: VISIBLE\n\n<div>\n-->\n\nx[^a]')).toStrictEqual([
			[6, ' open\n\n', {
				closer: '',
				onCommentLine: true,
			}],
		]);
		// An unreferenced definition renders nothing, so the range crosses it.
		expect(rendered('<div>\n<!-- open\n\n[^b]: A\n\n<div>\n--> B')).toStrictEqual([
			[6, ' open\n\n[^b]: A\n\n<div>\n', { onCommentLine: true }],
		]);
	});

	test('generated footnote markup closes open attributes', () => {
		// The quotes in a reference close the body's attribute.
		expect(rendered('<div title="\n\nx[^a] <!-- c -->VIS\n\n[^a]: A')).toStrictEqual([[20, ' c ']]);
		// The quotes in the list's opening markup close it.
		expect(rendered('x[^a]\n\n<div title="\n\n[^a]: <!-- a -->')).toStrictEqual([[27, ' a ', block]]);
		// The quotes in the backlinks close an attribute in a footnote.
		expect(rendered('x[^a][^b]\n\n[^a]: <div title="\n\n[^b]: <!-- b -->')).toStrictEqual([[37, ' b ', block]]);
	});

	test('definitions continue with indented and empty lines', () => {
		// A lazy continuation line stays in the paragraph.
		expect(rendered('x[^a]\n\n[^a]: A\nB <!-- a -->')).toStrictEqual([[17, ' a ', { nextLinePrefix: '    ' }]]);
		expect(rendered('x[^a]\n\n[^a]: A\n\n<!-- b -->')).toStrictEqual([[16, ' b ', { onCommentLine: true }]]);
		expect(rendered('x[^a]\n\n[^a]: A\n\n    <!-- b -->')).toStrictEqual([[20, ' b ', block]]);
		// A line of only spaces ends the definition, so the next line is code.
		expect(rendered('x[^a]\n\n[^a]: A\n  \n    <!-- b -->')).toStrictEqual([]);
		// An empty line that ends in a lone CR continues it.
		expect(rendered('x[^a]\n\n[^a]: A\n\r    <!-- b -->')).toStrictEqual([[20, ' b ', block]]);
		expect(rendered('x[^a]\n\n[^a]: A\r\r    <!-- b -->')).toStrictEqual([[20, ' b ', block]]);
		// Definitions nest, and each needs its own reference.
		expect(rendered('x[^a]\n\n[^a]: [^b]: <!-- b -->')).toStrictEqual([]);
		expect(rendered('x[^a][^b]\n\n[^a]: [^b]: <!-- b -->')).toStrictEqual([[23, ' b ', {
			nextLinePrefix: '        ',
			onCommentLine: true,
		}]]);
	});
});
