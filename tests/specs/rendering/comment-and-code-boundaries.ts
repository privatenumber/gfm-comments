import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('comment and code boundaries', () => {
	test('buffered HTML lines retain streamed comment positions and line context', () => {
		expect(rendered('x abcdef <span>\n\n<div>\n<span title="\n<!-- not a comment -->\n">\n  <!-- a -->\nold\n<!-- /a -->\n</div>')).toStrictEqual([
			[65, ' a ', { onCommentLine: true }],
			[80, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x [r](u) <span>\n\n<div>\n<span title="\n<!-- not a comment -->\n">\n  <!-- a -->\nold\n<!-- /a -->\n</div>')).toStrictEqual([
			[65, ' a ', { onCommentLine: true }],
			[80, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x abcdef <span>\n\n> <div>\n> <span title="\n> <!-- not a comment -->\n> ">\n>   <!-- a -->\n> old\n> <!-- /a -->\n> </div>')).toStrictEqual([
			[75, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[94, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
		expect(rendered('x [r](u) <span>\n\n> <div>\n> <span title="\n> <!-- not a comment -->\n> ">\n>   <!-- a -->\n> old\n> <!-- /a -->\n> </div>')).toStrictEqual([
			[75, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[94, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
		expect(rendered('x abcdef <span>\r\n\r\n<div>\r\n<span title="\r\n<!-- not a comment -->\r\n">\r\n  <!-- a -->\r\nold\r\n<!-- /a -->\r\n</div>')).toStrictEqual([
			[71, ' a ', { onCommentLine: true }],
			[88, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x [r](u) <span>\r\n\r\n<div>\r\n<span title="\r\n<!-- not a comment -->\r\n">\r\n  <!-- a -->\r\nold\r\n<!-- /a -->\r\n</div>')).toStrictEqual([
			[71, ' a ', { onCommentLine: true }],
			[88, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x abcdef <span>\r\n\r\n> <div>\r\n> <span title="\r\n> <!-- not a comment -->\r\n> ">\r\n>   <!-- a -->\r\n> old\r\n> <!-- /a -->\r\n> </div>')).toStrictEqual([
			[81, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[102, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
		expect(rendered('x [r](u) <span>\r\n\r\n> <div>\r\n> <span title="\r\n> <!-- not a comment -->\r\n> ">\r\n>   <!-- a -->\r\n> old\r\n> <!-- /a -->\r\n> </div>')).toStrictEqual([
			[81, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[102, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
		expect(rendered('x abcdef <span>\r\r<div>\r<span title="\r<!-- not a comment -->\r">\r  <!-- a -->\rold\r<!-- /a -->\r</div>')).toStrictEqual([
			[65, ' a ', { onCommentLine: true }],
			[80, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x [r](u) <span>\r\r<div>\r<span title="\r<!-- not a comment -->\r">\r  <!-- a -->\rold\r<!-- /a -->\r</div>')).toStrictEqual([
			[65, ' a ', { onCommentLine: true }],
			[80, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x abcdef <span>\r\r> <div>\r> <span title="\r> <!-- not a comment -->\r> ">\r>   <!-- a -->\r> old\r> <!-- /a -->\r> </div>')).toStrictEqual([
			[75, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[94, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
		expect(rendered('x [r](u) <span>\r\r> <div>\r> <span title="\r> <!-- not a comment -->\r> ">\r>   <!-- a -->\r> old\r> <!-- /a -->\r> </div>')).toStrictEqual([
			[75, ' a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[94, ' /a ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
	});

	test('a fenced example containing <!-- does not hide the next marker', () => {
		expect(rendered('```html\n<!--\n```\n<!-- x -->old<!-- /x -->')).toStrictEqual([
			[17, ' x ', { onCommentLine: true }],
			[30, ' /x ', { onCommentLine: true }],
		]);
	});

	test('an inline example containing <!-- does not hide the next marker', () => {
		expect(rendered('`<!--` <!-- x -->old<!-- /x -->')).toStrictEqual([
			[7, ' x '],
			[20, ' /x '],
		]);
	});

	test('a backtick in an attribute value does not hide the closing comment', () => {
		expect(rendered('<!-- a note="`" -->old<!-- /a -->`')).toStrictEqual([
			[0, ' a note="`" ', { onCommentLine: true }],
			[22, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a fence-looking line inside an HTML comment does not hide later markers', () => {
		expect(rendered('<!--\n```\n-->\n<!-- x -->old<!-- /x -->')).toStrictEqual([
			[0, '\n```\n', { onCommentLine: true }],
			[13, ' x ', { onCommentLine: true }],
			[26, ' /x ', { onCommentLine: true }],
		]);
	});
});
