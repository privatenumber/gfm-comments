import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('empty comments', () => {
	test('an empty comment does not hide the next marker', () => {
		expect(rendered('x <!--> <!-- a -->old<!-- /a -->')).toStrictEqual([
			[2, '', { closer: '>' }],
			[8, ' a '],
			[21, ' /a '],
		]);
		expect(rendered('<!-->\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[6, ' a ', { onCommentLine: true }],
			[19, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('x <!---> <!-- a -->old<!-- /a -->')).toStrictEqual([
			[2, '', { closer: '->' }],
			[9, ' a '],
			[22, ' /a '],
		]);
		expect(rendered('<!--->\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '->',
			}],
			[7, ' a ', { onCommentLine: true }],
			[20, ' /a ', { onCommentLine: true }],
		]);
	});
});
