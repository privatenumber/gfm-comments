import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('paragraph interruption', () => {
	test('an ordered marker other than one does not interrupt a paragraph', () => {
		expect(rendered('paragraph\n2. ~~~\n   <!-- x -->real<!-- /x -->\n   ~~~')).toStrictEqual([
			[20, ' x ', { onCommentLine: true }],
			[34, ' /x ', { onCommentLine: true }],
		]);
	});

	test('a marker after a dropped container is not treated as paragraph text', () => {
		expect(rendered('- item\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([]);
	});

	test('an ordered marker inside a blockquote paragraph does not interrupt it', () => {
		expect(rendered('> paragraph\n> 2. ~~~\n>    <!-- x -->real<!-- /x -->\n>    ~~~')).toStrictEqual([
			[26, ' x ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
			[40, ' /x ', {
				nextLinePrefix: '> ',
				onCommentLine: true,
			}],
		]);
	});
});
