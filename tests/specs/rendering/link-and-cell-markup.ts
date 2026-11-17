import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

const block = { onCommentLine: true };

// Links, images, autolinks, and aligned table cells write quoted attributes.
// Each case opens an attribute value or a tag in an HTML block, and the
// generated markup decides whether a later `<!--` is a comment. The GitHub
// probes are fixtures in tests/fixtures/github-probes.json.
describe('link and cell markup', () => {
	test('a paragraph of only definitions writes no markup', () => {
		// The unfinished tag stays open, so `<!--` is part of it
		// (fixture `definition-only-paragraph-keeps-tag`).
		expect(rendered('<!-- a --><a b\n\n[r]: /u\n<!-- c > HIDE -->SHOW')).toStrictEqual([[0, ' a ', block]]);
		// Text after the definition renders as `<p>`, which ends the tag.
		expect(rendered('<!-- a --><a b\n\n[r]: /u\nx\n\n<!-- c -->')).toStrictEqual([
			[0, ' a ', block],
			[27, ' c ', block],
		]);
	});

	test('a resolved link writes the quotes of its destination and title', () => {
		// `<a href="/u">` closes the double-quoted value (fixture `reference-link-closes-value`).
		expect(rendered('<!-- a --><a title="\n\n[r]: /u\n\n[x][r]<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[37, ' b '],
		]);
		// `title="it's"` closes the single-quoted value.
		expect(rendered('<!-- a --><a title=\'\n\n[x](/u "it\'s")<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[36, ' b '],
		]);
	});

	test('a link writes markup in a block without raw HTML', () => {
		// Probe 3.
		expect(rendered('<!-- a --><a title="\n\n[x](/u)\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[31, ' b ', block],
		]);
	});

	test('an image writes quoted attributes', () => {
		// Probe 10.
		expect(rendered('<!-- a --><a title="\n\n![x](/u)\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[32, ' b ', block],
		]);
	});

	test('autolinks write their destination', () => {
		// Probes 5 and 6.
		expect(rendered('<!-- a --><a title="\n\nwww.x.y\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[31, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title="\n\n<http://x>\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[34, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title="\n\n<a@b.c>\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[31, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title="\n\nx http://x.y\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[36, ' b ', block],
		]);
	});

	test('aligned table cells write their alignment', () => {
		// Probes 7 and 8.
		expect(rendered('<!-- a --><a title="\n\n| x |\n| :- |\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[36, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title="\n\n| x | y |\n| - | :- |\n| z |\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[50, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title="\n\n| x |\n| - |\n\n<!-- b -->')).toStrictEqual([[0, ' a ', block]]);
	});

	test('generated empty cells write their alignment', () => {
		// The title's `'` closes the single-quoted value, and its `b="` opens a
		// double-quoted one, which an aligned cell's quote closes.
		expect(rendered('<!-- a --><a title=\'\n\n| x | y |\n| - | :- |\n| [l](/u "a\' b=") |\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[64, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title=\'\n\n| x | y |\n| - | :- |\n| [l](/u "a\' b=") | z |\n\n<!-- b -->')).toStrictEqual([
			[0, ' a ', block],
			[68, ' b ', block],
		]);
		expect(rendered('<!-- a --><a title=\'\n\n| x | y |\n| - | - |\n| [l](/u "a\' b=") |\n\n<!-- b -->')).toStrictEqual([[0, ' a ', block]]);
	});

	// `[x][r] <sup>s</sup>` starts holding events in the data state, until
	// `[r]` is defined. A held line or span that leaves the data state must
	// keep the later link or cell markup, whose quote closes the value.
	test('held markup meets the state that held raw HTML leaves', () => {
		expect(rendered('[x][r] <sup>s</sup>\n\n<div title="\n\n[y](/u)\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([[44, ' b ', block]]);
		expect(rendered('[x][r] <sup>s</sup>\n\n<div>\n<a title="\n\n[y](/u)\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([[48, ' b ', block]]);
		expect(rendered('[x][r] <sup>s</sup>\n\n<div title="\n\n| x |\n| :- |\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([[49, ' b ', block]]);
		// `--!>` closes the comment, so the line's last `-->` is in a value.
		expect(rendered('[x][r] <sup>s</sup>\n\n<!-- c --!><div title=" -->\n\n[y](/u)\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([
			[21, ' c ', {
				onCommentLine: true,
				closer: '--!>',
			}],
			[59, ' b ', block],
		]);
		// cmark-gfm ends an inline comment at `-->`, but the browser ends it at
		// `--!>`, so the rest is a tag with an open value.
		const bang = [6, ' p ', { closer: '--!>' }];
		expect(rendered('x [y] <!-- p --!><a title="-->\n\n[z](/u)\n\n<!-- b -->\n\n[y]: /u')).toStrictEqual([bang, [41, ' b ', block]]);
		expect(rendered('x [y] <!-- p --!><a title="-->\n\n| x |\n| :- |\n\n<!-- b -->\n\n[y]: /u')).toStrictEqual([bang, [46, ' b ', block]]);
		// A processing instruction or CDATA section ends at its first `>`.
		expect(rendered('[x][r] <?p > <a title=" ?>\n\n[y](/u)\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([[37, ' b ', block]]);
		expect(rendered('[x][r] <![CDATA[ > <a title=" ]]>\n\n[y](/u)\n\n<!-- b -->\n\n[r]: /u')).toStrictEqual([[44, ' b ', block]]);
	});
});
