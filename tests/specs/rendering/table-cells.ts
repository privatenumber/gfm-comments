import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('table cells', () => {
	test('unescapes the paragraph split off before the header', () => {
		expect(rendered('x <!-- a -->PRESERVE ![<!-- a -->inner][r\\|s] tail<!-- /a -->\n| a |\n| - |\n\n[r\\|s]: /u')).toStrictEqual([
			[2, ' a '],
			[23, ' a '],
			[50, ' /a '],
		]);
		expect(rendered('x <!-- a -->PRESERVE ![<!-- a -->inner][r\\|s] tail<!-- /a -->\n\n[r\\|s]: /u')).toStrictEqual([
			[2, ' a '],
			[50, ' /a '],
		]);
	});

	test('maps each line in a paragraph split off before a header', () => {
		expect(rendered('first \\|\nsecond \\| <!-- a -->old<!-- /a -->\nthird \\| <!-- b -->yes<!-- /b -->\n| a |\n| - |')).toStrictEqual([
			[19, ' a '],
			[32, ' /a '],
			[53, ' b '],
			[66, ' /b '],
		]);
	});

	test('maps a raw comment spanning paragraph lines after an escaped pipe', () => {
		expect(rendered('first \\| <!-- a\n -->old<!-- /a -->\n| a |\n| - |')).toStrictEqual([
			[9, ' a\n '],
			[23, ' /a '],
		]);
		expect(rendered('first \\| <!-- a\r\n -->old<!-- /a -->\r\n| a |\r\n| - |')).toStrictEqual([
			[9, ' a\r\n '],
			[24, ' /a '],
		]);
		expect(rendered('first \\| <!-- a\r -->old<!-- /a -->\r| a |\r| - |')).toStrictEqual([
			[9, ' a\r '],
			[23, ' /a '],
		]);
	});

	test('unescapes pipes before resolving image references', () => {
		expect(rendered('| x |\n| - |\n| x <!-- a -->PRESERVE ![<!-- a -->inner][r\\|s] tail<!-- /a --> |\n\n[r\\|s]: /u')).toStrictEqual([
			[16, ' a '],
			[37, ' a '],
			[64, ' /a '],
		]);
	});

	test('keeps code spans containing escaped pipes literal', () => {
		expect(rendered('| x |\n| - |\n| `a\\|<!-- a -->old<!-- /a -->` |\n\n<!-- a -->real<!-- /a -->')).toStrictEqual([
			[47, ' a ', { onCommentLine: true }],
			[61, ' /a ', { onCommentLine: true }],
		]);
	});

	test('maps comments after escaped pipes and raw HTML attributes', () => {
		expect(rendered('| x |\n| - |\n| before \\| <!-- a -->old<!-- /a --> |')).toStrictEqual([
			[24, ' a '],
			[37, ' /a '],
		]);
		expect(rendered('| x |\n| - |\n| <a title="\\|"><!-- a -->old<!-- /a --> |')).toStrictEqual([
			[28, ' a '],
			[41, ' /a '],
		]);
	});
});
