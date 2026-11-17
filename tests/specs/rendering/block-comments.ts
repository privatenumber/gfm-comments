import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('block comments', () => {
	test('a standalone comment does not expose a following list fence', () => {
		expect(rendered('<!-- note -->\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([
			[0, ' note ', { onCommentLine: true }],
		]);
	});

	test('an indented standalone comment does not expose a following list fence', () => {
		expect(rendered('  <!-- note -->\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([
			[2, ' note ', { onCommentLine: true }],
		]);
	});

	test('a multiline standalone comment does not expose a following list fence', () => {
		expect(rendered('<!--\nnote\n-->\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([
			[0, '\nnote\n', { onCommentLine: true }],
		]);
	});

	test('a block comment interrupts an open paragraph', () => {
		expect(rendered('paragraph\n<!-- note -->\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([
			[10, ' note ', { onCommentLine: true }],
		]);
	});

	test('a comment inside a paragraph does not end it', () => {
		expect(rendered('text <!-- note -->\n2. ~~~\n   <!-- x -->real<!-- /x -->\n   ~~~')).toStrictEqual([
			[5, ' note '],
			[29, ' x ', { onCommentLine: true }],
			[43, ' /x ', { onCommentLine: true }],
		]);
	});
});
