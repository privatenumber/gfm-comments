import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('line endings', () => {
	test('a marker after a closed fence is recognized in a CR-only document', () => {
		expect(rendered('~~~\rcode\r~~~\r<!-- x -->real<!-- /x -->')).toStrictEqual([
			[13, ' x ', { onCommentLine: true }],
			[27, ' /x ', { onCommentLine: true }],
		]);
	});

	test('a marker after a closed fence is recognized in a CRLF document', () => {
		expect(rendered('~~~\r\ncode\r\n~~~\r\n<!-- x -->real<!-- /x -->')).toStrictEqual([
			[16, ' x ', { onCommentLine: true }],
			[30, ' /x ', { onCommentLine: true }],
		]);
	});

	test('preserves the line endings around a replaced section', () => {
		expect(rendered('before\r\n<!-- a -->old<!-- /a -->\r\nafter')).toStrictEqual([
			[8, ' a ', { onCommentLine: true }],
			[21, ' /a ', { onCommentLine: true }],
		]);
	});
});
