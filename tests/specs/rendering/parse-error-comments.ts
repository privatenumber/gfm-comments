import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

// The browser still builds a comment at these HTML parse errors. GitHub
// /markdown on 2026-11-16 hid the text after each comment that runs to the end,
// and showed the text after each `--!>`.
describe('comments that end at a parse error', () => {
	test('a comment that is never closed runs to the end of the document', () => {
		expect(rendered('> <!-- a\n\nVISIBLE')).toStrictEqual([
			[2, ' a\n\nVISIBLE', {
				nextLinePrefix: '> ',
				onCommentLine: true,
				closer: '',
			}],
		]);
		expect(rendered('<div> <!-- a\n\nV')).toStrictEqual([
			[6, ' a\n\nV', { closer: '' }],
		]);
		// The open comment swallows the rendered list end and code block
		expect(rendered('- <!-- a\n\n```\nx\n```')).toStrictEqual([
			[2, ' a\n\n```\nx\n```', {
				nextLinePrefix: '  ',
				onCommentLine: true,
				closer: '',
			}],
		]);
	});

	test('inline raw HTML can leave a comment open', () => {
		// The CDATA and processing instruction are bogus comments that end at `>`
		expect(rendered('# x <![CDATA[ > <!-- ]]>\n\nV')).toStrictEqual([
			[16, ' ]]>\n\nV', { closer: '' }],
		]);
		expect(rendered('| a |\n| - |\n| <?x > <!-- ?> |\n\nV')).toStrictEqual([
			[20, ' ?> |\n\nV', { closer: '' }],
		]);
	});

	test('--!> closes a comment', () => {
		expect(rendered('<!-- a --!>\n\nVISIBLE')).toStrictEqual([
			[0, ' a ', {
				onCommentLine: true,
				closer: '--!>',
			}],
		]);
		// cmark-gfm ends the raw HTML span at `-->`, and the browser ends the comment earlier
		expect(rendered('x <!-- a --!> VISIBLE -->')).toStrictEqual([
			[2, ' a ', { closer: '--!>' }],
		]);
	});
});
