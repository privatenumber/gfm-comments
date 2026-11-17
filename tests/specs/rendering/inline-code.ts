import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('inline code', () => {
	test('ignores markers inside inline code', () => {
		expect(rendered('See `<!-- a -->example<!-- /a -->` for details')).toStrictEqual([]);
	});

	test('parses markers outside of code', () => {
		expect(rendered('`<!-- a -->inline<!-- /a -->`\n<!-- b -->real<!-- /b -->')).toStrictEqual([
			[30, ' b ', { onCommentLine: true }],
			[44, ' /b ', { onCommentLine: true }],
		]);
	});

	test('an escaped backtick does not open inline code', () => {
		expect(rendered('\\`<!-- a -->real<!-- /a -->`')).toStrictEqual([
			[2, ' a '],
			[16, ' /a '],
		]);
	});

	test('an unterminated inline code span does not hide later markers', () => {
		expect(rendered('`unclosed\n<!-- a -->real<!-- /a -->')).toStrictEqual([
			[10, ' a ', { onCommentLine: true }],
			[24, ' /a ', { onCommentLine: true }],
		]);
	});

	test('two backslashes before an opening backtick do not escape it', () => {
		expect(rendered('\\\\`<!-- x -->example<!-- /x -->`')).toStrictEqual([]);
	});

	test('a backslash before a closing backtick does not escape it inside a span', () => {
		expect(rendered('`<!-- x -->example<!-- /x -->\\`')).toStrictEqual([]);
	});

	test('an escaped multi-backtick run cannot close an existing span', () => {
		expect(rendered('`example \\`` <!-- x -->example<!-- /x -->`')).toStrictEqual([]);
	});
});
