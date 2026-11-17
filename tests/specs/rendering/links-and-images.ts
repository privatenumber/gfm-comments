import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('links and images', () => {
	test('reference labels use cmark case folding and replacement characters', () => {
		expect(rendered('x <!-- a -->outer ![<!-- a -->inner][ı] tail<!-- /a -->\n\n[I]: /u')).toStrictEqual([
			[2, ' a '],
			[20, ' a '],
			[44, ' /a '],
		]);
		expect(rendered('![<!-- a -->old<!-- /a -->][�]\n\n[\u0000]: /url')).toStrictEqual([]);
		expect(rendered('![<!-- a -->old<!-- /a -->][�]\n\n[\uD800]: /url')).toStrictEqual([]);
		expect(rendered('![<!-- a -->old<!-- /a -->][�]\n\n[\uDC00]: /url')).toStrictEqual([]);
		expect(rendered('![<!-- a -->old<!-- /a -->][SS]\n\n[ß]: /url')).toStrictEqual([]);
	});

	test('reference links preserve nested marker boundaries', () => {
		expect(rendered('x <!-- a -->old [outer [ref]](<!-- /a -->) PRESERVE <!-- /a -->\n\n[ref]: /u')).toStrictEqual([
			[2, ' a '],
			[30, ' /a '],
			[52, ' /a '],
		]);
		expect(rendered('x <!-- a -->outer [a [b][r]](<!-- a -->) tail<!-- /a -->\n\n[r]: /url')).toStrictEqual([
			[2, ' a '],
			[29, ' a '],
			[45, ' /a '],
		]);
	});

	test('reference links and images resolve definitions after their use', () => {
		expect(rendered('x [<!-- a -->old<!-- /a -->][r]')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x [<!-- a -->old<!-- /a -->][r]\n\n[r]: /u')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][r]')).toStrictEqual([
			[4, ' a '],
			[17, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][r]\n\n[r]: /u')).toStrictEqual([]);
		expect(rendered('x [<!-- a -->old<!-- /a -->][]')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x [<!-- a -->old<!-- /a -->][]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][]')).toStrictEqual([
			[4, ' a '],
			[17, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([]);
		expect(rendered('x [<!-- a -->old<!-- /a -->][ ]')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x [<!-- a -->old<!-- /a -->][ ]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][ ]')).toStrictEqual([
			[4, ' a '],
			[17, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->][ ]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([]);
		expect(rendered('x [<!-- a -->old<!-- /a -->]')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x [<!-- a -->old<!-- /a -->]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->]')).toStrictEqual([
			[4, ' a '],
			[17, ' /a '],
		]);
		expect(rendered('x ![<!-- a -->old<!-- /a -->]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([]);
		expect(rendered('![<!-- a -->old<!-- /a -->][r]\n\n[r]: /url')).toStrictEqual([]);
		expect(rendered('![<!-- a -->old<!-- /a -->][SS]\n\n[ß]: /url')).toStrictEqual([]);
		expect(rendered('x [text][<!-- a -->old<!-- /a -->]\n\n[<!-- a -->old<!-- /a -->]: /u')).toStrictEqual([]);
	});

	test('destinations and titles do not render comments', () => {
		expect(rendered('[x](<!-- a -->)<!-- /a -->')).toStrictEqual([
			[15, ' /a '],
		]);
		expect(rendered('[x](u<!--a-->)<!-- /a -->')).toStrictEqual([
			[14, ' /a '],
		]);
		expect(rendered('[x](u(a(b))<!--a-->)<!-- /a -->')).toStrictEqual([
			[20, ' /a '],
		]);
		expect(rendered(String.raw`[x](u\)<!--a-->)<!-- /a -->`)).toStrictEqual([
			[16, ' /a '],
		]);
		expect(rendered(String.raw`[x](u\(<!--a-->)<!-- /a -->`)).toStrictEqual([
			[16, ' /a '],
		]);
		expect(rendered('[x](u "<!-- a -->")<!-- /a -->')).toStrictEqual([
			[19, ' /a '],
		]);
		expect(rendered('[x](u \'<!-- a -->\')<!-- /a -->')).toStrictEqual([
			[19, ' /a '],
		]);
		expect(rendered('[x](u (<!-- a -->))<!-- /a -->')).toStrictEqual([
			[19, ' /a '],
		]);
		expect(rendered('[x](\u000B<!-- a -->)<!-- /a -->')).toStrictEqual([
			[16, ' /a '],
		]);
		expect(rendered('[x](u\u000B<!--a-->)<!-- /a -->')).toStrictEqual([
			[15, ' /a '],
		]);
		expect(rendered('[x](u\u000C<!--a-->)<!-- /a -->')).toStrictEqual([
			[15, ' /a '],
		]);
		expect(rendered('[a [b]](<!-- a -->)<!-- /a -->')).toStrictEqual([
			[19, ' /a '],
		]);
		expect(rendered('[a `]` b](<!-- a -->)<!-- /a -->')).toStrictEqual([
			[21, ' /a '],
		]);
	});

	test('link text and literal links retain comments', () => {
		expect(rendered('[x <!-- a -->old<!-- /a -->](u)')).toStrictEqual([
			[3, ' a '],
			[16, ' /a '],
		]);
		expect(rendered('[x](u <!-- a -->old<!-- /a -->)')).toStrictEqual([
			[6, ' a '],
			[19, ' /a '],
		]);
		expect(rendered(String.raw`\[x](<!-- a -->old<!-- /a -->)`)).toStrictEqual([
			[5, ' a '],
			[18, ' /a '],
		]);
		expect(rendered('![<!-- a -->old<!-- /a -->')).toStrictEqual([
			[2, ' a '],
			[15, ' /a '],
		]);
	});

	test('a link disables older link openers', () => {
		expect(rendered('[a [b](u)](<!-- a -->)<!-- /a -->')).toStrictEqual([
			[11, ' a '],
			[22, ' /a '],
		]);
	});

	test('image alt text escapes comments, including nested links and images', () => {
		expect(rendered('![<!-- a -->old<!-- /a -->](u)')).toStrictEqual([]);
		expect(rendered('[a ![<!-- a -->old<!-- /a -->](u)](v)')).toStrictEqual([]);
		expect(rendered('![a [<!-- a -->old<!-- /a -->](u)](v)')).toStrictEqual([]);
		expect(rendered('![before ![<!-- a -->old<!-- /a -->](u) after')).toStrictEqual([]);
		expect(rendered('![before ![<!-- a -->old<!-- /a -->] after](u)')).toStrictEqual([]);
	});

	test('a bracket followed by a caret is not an image opener', () => {
		expect(rendered('x <!-- a -->outer ![^<!-- a -->inner](u) tail<!-- /a -->')).toStrictEqual([
			[2, ' a '],
			[21, ' a '],
			[45, ' /a '],
		]);
	});

	test('image spans are emitted in order when an image is literal', () => {
		expect(rendered('![<!-- a -->old<!-- /a -->] nope <!-- b -->yes<!-- /b -->')).toStrictEqual([
			[2, ' a '],
			[15, ' /a '],
			[33, ' b '],
			[46, ' /b '],
		]);
	});

	test('reference destinations include vertical tab and form feed', () => {
		expect(rendered('[r]: u\u000B<!--a-->\n\n[r]\n<!-- /a -->')).toStrictEqual([
			[21, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[r]: u\u000C<!--a-->\n\n[r]\n<!-- /a -->')).toStrictEqual([
			[21, ' /a ', { onCommentLine: true }],
		]);
	});

	test('labels keep vertical tab and form feed', () => {
		expect(rendered('[\u000B]: <!-- a -->\n\n<!-- /a -->')).toStrictEqual([
			[17, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('[a\u000Bb]: <!-- a -->\n\n[a b]\n<!-- /a -->')).toStrictEqual([
			[25, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('![x <!-- a -->][\u000B]<!-- /a -->\n\n[x <!-- a -->]: /u')).toStrictEqual([
			[4, ' a '],
			[18, ' /a '],
		]);
		expect(rendered('![x <!-- a -->][\u000C]<!-- /a -->\n\n[x <!-- a -->]: /u')).toStrictEqual([
			[4, ' a '],
			[18, ' /a '],
		]);
	});
});
