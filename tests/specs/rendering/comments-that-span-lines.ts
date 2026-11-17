import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('comments that span lines', () => {
	test('a comment in a paragraph ends at a blank line', () => {
		expect(rendered('text <!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[16, ' a ', { onCommentLine: true }],
			[29, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at an ATX heading', () => {
		expect(rendered('text <!-- note\n# Heading\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[25, ' a ', { onCommentLine: true }],
			[38, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at a setext underline', () => {
		expect(rendered('text <!-- note\n===\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[19, ' a ', { onCommentLine: true }],
			[32, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at a thematic break', () => {
		expect(rendered('text <!-- note\n***\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[19, ' a ', { onCommentLine: true }],
			[32, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at a blockquote', () => {
		expect(rendered('text <!-- note\n> quote\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[23, ' a ', { onCommentLine: true }],
			[36, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at a bullet list item', () => {
		expect(rendered('text <!-- note\n- item\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[22, ' a ', { onCommentLine: true }],
			[35, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at a fence', () => {
		expect(rendered('text <!-- note\n~~~\n~~~\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[23, ' a ', { onCommentLine: true }],
			[36, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph ends at an HTML block', () => {
		expect(rendered('text <!-- note\n<div>\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[22, ' a ', { onCommentLine: true }],
			[35, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a comment in a paragraph continues on a paragraph line', () => {
		expect(rendered('text <!-- note\nmore <!-- a -->old<!-- /a -->')).toStrictEqual([
			[5, ' note\nmore <!-- a '],
			[33, ' /a '],
		]);
	});

	test('a comment in a paragraph continues on a lazy blockquote line', () => {
		expect(rendered('> text <!-- note\nmore <!-- a -->old<!-- /a -->')).toStrictEqual([
			[7, ' note\nmore <!-- a ', { nextLinePrefix: '> ' }],
			[35, ' /a ', { nextLinePrefix: '> ' }],
		]);
	});

	test('a comment in a paragraph continues on an ordered item that cannot interrupt a paragraph', () => {
		expect(rendered('text <!-- note\n2. more <!-- a -->old<!-- /a -->')).toStrictEqual([
			[5, ' note\n2. more <!-- a '],
			[36, ' /a '],
		]);
	});

	test('a comment in a heading ends with the heading', () => {
		expect(rendered('# Title <!-- note\ntext <!-- a -->old<!-- /a -->')).toStrictEqual([
			[23, ' a '],
			[36, ' /a '],
		]);
	});

	test('a comment opened on an HTML block line continues past a blank line', () => {
		expect(rendered('<div><!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[5, ' note\n\n<!-- a '],
			[29, ' /a '],
		]);
		expect(rendered('<div\u000C><!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[6, ' note\n\n<!-- a '],
			[30, ' /a '],
		]);
	});

	test('a comment opened on a later line of an HTML block is raw HTML', () => {
		expect(rendered('<div>\nx <!-- note\n# heading\n<!-- a -->old<!-- /a -->\n</div>')).toStrictEqual([
			[8, ' note\n# heading\n<!-- a '],
			[41, ' /a '],
		]);
	});

	test('a blockquote prefix does not close an HTML block that ends at >', () => {
		expect(rendered('> <!DOCTYPE\n> x <!-- note\n> # heading\n> <!-- a -->old<!-- /a -->')).toStrictEqual([
			[53, ' /a ', { nextLinePrefix: '> ' }],
		]);
	});

	test('an HTML block ends at a blank line', () => {
		expect(rendered('<div>\n\ntext <!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[23, ' a ', { onCommentLine: true }],
			[36, ' /a ', { onCommentLine: true }],
		]);
	});

	test('an HTML block ends at its closing tag', () => {
		expect(rendered('<pre>\n</pre>\ntext <!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[29, ' a ', { onCommentLine: true }],
			[42, ' /a ', { onCommentLine: true }],
		]);
	});

	test('an HTML block ends at the end of its list item', () => {
		expect(rendered('- <div>\n-\ntext <!-- note\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[26, ' a ', { onCommentLine: true }],
			[39, ' /a ', { onCommentLine: true }],
		]);
	});
});
