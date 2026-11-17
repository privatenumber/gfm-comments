import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('bare autolinks', () => {
	test('matches cmark-gfm 0.29.0.gfm.13 inline comments', () => {
		expect(rendered('\\<http://x>`aaa x <!-- a -->old<!-- /a -->+`')).toStrictEqual([
			[18, ' a '],
			[31, ' /a '],
		]);
		expect(rendered('http://x/![x <!-- a -->old<!-- /a -->](u)')).toStrictEqual([
			[13, ' a '],
			[26, ' /a '],
		]);
		expect(rendered('www.a.b/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[12, ' a '],
			[25, ' /a '],
		]);
		expect(rendered('www.a.b/(`) x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[14, ' a '],
			[27, ' /a '],
		]);
		expect(rendered('www.a.b/`) x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[13, ' a '],
			[26, ' /a '],
		]);
		expect(rendered('www.a.b/`&amp; x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[17, ' a '],
			[30, ' /a '],
		]);
		expect(rendered('www.a.b/`!!! x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[15, ' a '],
			[28, ' /a '],
		]);
		expect(rendered('(www.a.b/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[13, ' a '],
			[26, ' /a '],
		]);
		expect(rendered('`a`http://x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[16, ' a '],
			[29, ' /a '],
		]);
		expect(rendered('http://a.b.c.d.e.f.g.h.i.j.k._z/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[36, ' a '],
			[49, ' /a '],
		]);
		expect(rendered('http://é.x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[15, ' a '],
			[28, ' /a '],
		]);
		expect(rendered('http://é_foo/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[17, ' a '],
			[30, ' /a '],
		]);
		expect(rendered('http://😀_x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[16, ' a '],
			[29, ' /a '],
		]);
		expect(rendered('http://\u0000_x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[15, ' a '],
			[28, ' /a '],
		]);
		expect(rendered('www.é/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([
			[10, ' a '],
			[23, ' /a '],
		]);
		expect(rendered('http://a/<!-- a -->old<!-- /a -->')).toStrictEqual([
			[9, ' a '],
			[22, ' /a '],
		]);
		expect(rendered(String.raw`http://x/\<!-- a -->old<!-- /a -->`)).toStrictEqual([
			[10, ' a '],
			[23, ' /a '],
		]);
		expect(rendered('http://…x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([]);
		expect(rendered('http://a_b.x/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([]);
		expect(rendered('http://a\\_.b/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([]);
		expect(rendered('www.a._z/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([]);
		expect(rendered('xwww.a.b/` x <!-- a -->old<!-- /a -->`')).toStrictEqual([]);
		expect(rendered('[http://a/` x <!-- a -->old<!-- /a -->`]')).toStrictEqual([]);
		expect(rendered('![http://a/` x <!-- a -->old<!-- /a -->`]')).toStrictEqual([]);
	});

	test('does not replace across a non-ASCII host', () => {
		expect(rendered('x <!-- a -->PRESERVE http://a/` http://é_foo/` y <!-- a -->inner ` tail<!-- /a -->')).toStrictEqual([
			[2, ' a '],
			[49, ' a '],
			[71, ' /a '],
		]);
	});

	test('counts references after an autolinked backtick', () => {
		expect(rendered(`https://a.com/\`${' [r]'.repeat(101)} \`x <!-- a -->PRESERVE ![<!-- a -->old][r] tail<!-- /a -->\n\n[r]: ${'u'.repeat(1000)}`)).toStrictEqual([
			[423, ' a '],
			[444, ' a '],
			[466, ' /a '],
		]);
	});

	test('uses the renderer backtick cache after a failed long run', () => {
		expect(rendered('``:<a@b.c><http://`<?-`_><a@b.c><http://`x <!-- a -->old<!-- /a -->a.b-c`')).toStrictEqual([
			[43, ' a '],
			[56, ' /a '],
		]);
	});
});
