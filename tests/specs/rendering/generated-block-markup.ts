import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('generated block markup', () => {
	test('rendered code and break markup decide whether an attribute value closes', () => {
		expect(rendered('<!--><a x=\'\n\n```&apos;\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[28, ' a ', { onCommentLine: true }],
			[41, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n```\\&apos;\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[29, ' a ', { onCommentLine: true }],
			[42, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n```&Tab; x&apos;\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[35, ' a ', { onCommentLine: true }],
			[48, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n```\n\'\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[24, ' a ', { onCommentLine: true }],
			[37, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n```\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
		expect(rendered('<!--><a x=\'\n\n    \'\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[20, ' a ', { onCommentLine: true }],
			[33, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n>  ```\r\n> \t\'\r\n>  ```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[35, ' a ', { onCommentLine: true }],
			[48, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x=\'\n\n```\rx\r```\r\'\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
		expect(rendered('<!--><a x="\n\n```js\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[24, ' a ', { onCommentLine: true }],
			[37, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x="\n\n```&quot;\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[28, ' a ', { onCommentLine: true }],
			[41, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<!--><a x="\n\n```&Tab;\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
		expect(rendered('<!--><a x="\n\n```\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
		expect(rendered('<!--><a x="\n\n---\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
		expect(rendered('<!--><a x=\'\n\n---\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
		]);
	});

	test('reports only comments with source positions', () => {
		expect(rendered('<!--><a x=\'\n\n```\n\'<!-- a -->bogus<!-- /a -->\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[50, ' a ', { onCommentLine: true }],
			[63, ' /a ', { onCommentLine: true }],
		]);
	});

	test('ignores code block markers while the tokenizer is in data state', () => {
		expect(rendered('<!-- a -->old<!-- /a -->\n\n```\n<!-- a -->bogus<!-- /a -->\n```\n')).toStrictEqual([
			[0, ' a ', { onCommentLine: true }],
			[13, ' /a ', { onCommentLine: true }],
		]);
	});

	test('task-list checkboxes do not end an open attribute value', () => {
		expect(rendered('<!--><a x="\n\n- [x] item <!-- a -->BEFORE<!-- /a --><i title="v">AFTER</i><!-- a -->VISIBLE<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[73, ' a ', { nextLinePrefix: '  ' }],
			[90, ' /a ', { nextLinePrefix: '  ' }],
		]);
		expect(rendered('<!--><a x="\n\n- [ ] item <!-- a -->BEFORE<!-- /a --><i title="v">AFTER</i><!-- a -->VISIBLE<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[73, ' a ', { nextLinePrefix: '  ' }],
			[90, ' /a ', { nextLinePrefix: '  ' }],
		]);
		expect(rendered('<!--><a x="\n\n- ordinary item <!-- a -->BEFORE<!-- /a --><i title="v">AFTER</i><!-- a -->VISIBLE<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[78, ' a ', { nextLinePrefix: '  ' }],
			[95, ' /a ', { nextLinePrefix: '  ' }],
		]);
		expect(rendered('<!--><a x="\n\n- <input type="checkbox" disabled="" /> item <!-- a -->BEFORE<!-- /a --><i title="v">AFTER</i><!-- a -->VISIBLE<!-- /a -->')).toStrictEqual([
			[0, '', {
				onCommentLine: true,
				closer: '>',
			}],
			[58, ' a ', { nextLinePrefix: '  ' }],
			[74, ' /a ', { nextLinePrefix: '  ' }],
			[107, ' a ', { nextLinePrefix: '  ' }],
			[124, ' /a ', { nextLinePrefix: '  ' }],
		]);
	});

	test('reads generated quotes in streamed and buffered block events', () => {
		expect(rendered('<div>\n<a x=\'\n\n```\n\'\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[25, ' a ', { onCommentLine: true }],
			[38, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<a x=\'\n\n    \'\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[21, ' a ', { onCommentLine: true }],
			[34, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<a x=\'\n\n```&apos;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[31, ' a ', { onCommentLine: true }],
			[44, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<a x=\'\n\n```&#39;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[30, ' a ', { onCommentLine: true }],
			[43, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<a x=\'\n\n```&bsol;&apos;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[37, ' a ', { onCommentLine: true }],
			[50, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<a x=\'\n\n```&Tab;&#39; ignored\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[43, ' a ', { onCommentLine: true }],
			[56, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r```\r\'\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[25, ' a ', { onCommentLine: true }],
			[38, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r    \'\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[21, ' a ', { onCommentLine: true }],
			[34, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r```&apos;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[31, ' a ', { onCommentLine: true }],
			[44, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r```&#39;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[30, ' a ', { onCommentLine: true }],
			[43, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r```&bsol;&apos;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[37, ' a ', { onCommentLine: true }],
			[50, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r<a x=\'\r\r```&Tab;&#39; ignored\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[43, ' a ', { onCommentLine: true }],
			[56, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n```\r\n\'\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[32, ' a ', { onCommentLine: true }],
			[45, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n    \'\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[26, ' a ', { onCommentLine: true }],
			[39, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n```&apos;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[38, ' a ', { onCommentLine: true }],
			[51, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n```&#39;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[37, ' a ', { onCommentLine: true }],
			[50, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n```&bsol;&apos;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[44, ' a ', { onCommentLine: true }],
			[57, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\r\n<a x=\'\r\n\r\n```&Tab;&#39; ignored\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[50, ' a ', { onCommentLine: true }],
			[63, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n```\n\'\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[46, ' a ', { onCommentLine: true }],
			[59, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n    \'\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[42, ' a ', { onCommentLine: true }],
			[55, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n```&apos;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[52, ' a ', { onCommentLine: true }],
			[65, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n```&#39;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[51, ' a ', { onCommentLine: true }],
			[64, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n```&bsol;&apos;\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[58, ' a ', { onCommentLine: true }],
			[71, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\n\n[r]: /\n\n<div>\n<a x=\'\n\n```&Tab;&#39; ignored\nx\n```\n\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[64, ' a ', { onCommentLine: true }],
			[77, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r```\r\'\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[46, ' a ', { onCommentLine: true }],
			[59, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r    \'\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[42, ' a ', { onCommentLine: true }],
			[55, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r```&apos;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[52, ' a ', { onCommentLine: true }],
			[65, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r```&#39;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[51, ' a ', { onCommentLine: true }],
			[64, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r```&bsol;&apos;\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[58, ' a ', { onCommentLine: true }],
			[71, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\r[r]: /\r\r<div>\r<a x=\'\r\r```&Tab;&#39; ignored\rx\r```\r\r<!-- a -->old<!-- /a -->')).toStrictEqual([
			[64, ' a ', { onCommentLine: true }],
			[77, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n```\r\n\'\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[57, ' a ', { onCommentLine: true }],
			[70, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n    \'\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[51, ' a ', { onCommentLine: true }],
			[64, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n```&apos;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[63, ' a ', { onCommentLine: true }],
			[76, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n```&#39;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[62, ' a ', { onCommentLine: true }],
			[75, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n```&bsol;&apos;\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[69, ' a ', { onCommentLine: true }],
			[82, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[<span>][r]\r\n\r\n[r]: /\r\n\r\n<div>\r\n<a x=\'\r\n\r\n```&Tab;&#39; ignored\r\nx\r\n```\r\n\r\n<!-- a -->old<!-- /a -->')).toStrictEqual([
			[75, ' a ', { onCommentLine: true }],
			[88, ' /a ', { onCommentLine: true }],
		]);
	});
});
