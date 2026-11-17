import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('foreign content', () => {
	test('tracks void names in foreign content', () => {
		expect(rendered('<svg><source><svg></source></svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[33, ' a '],
			[64, ' a '],
			[86, ' /a '],
		]);
		expect(rendered('<svg><source></source><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[22, ' a '],
			[75, ' /a '],
		]);
		expect(rendered('<svg><br><svg></br></svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[25, ' a '],
			[56, ' a '],
			[78, ' /a '],
		]);
		expect(rendered('<svg></br><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[10, ' a '],
			[63, ' /a '],
		]);
	});

	test('generated thematic break completes an unfinished SVG tag', () => {
		expect(rendered('<div>\n<svg\n\n---\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[17, ' a ', { onCommentLine: true }],
			[48, ' a ', { onCommentLine: true }],
			[70, ' /a ', { onCommentLine: true }],
		]);
	});

	test('generated fenced code completes an unfinished SVG tag', () => {
		expect(rendered('<div>\n<pre><svg\n\n```\nx\n```\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[28, ' a ', { onCommentLine: true }],
			[59, ' a ', { onCommentLine: true }],
			[81, ' /a ', { onCommentLine: true }],
		]);
	});

	test('fenced code with an info string retains foreign content', () => {
		expect(rendered('<div>\n<svg\n\n```js\nx\n```\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[25, ' a ', { onCommentLine: true }],
			[78, ' /a ', { onCommentLine: true }],
		]);
	});

	test('generated * closes foreign content', () => {
		expect(rendered('*<svg>* <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[8, ' a '],
			[39, ' a '],
			[61, ' /a '],
		]);
	});

	test('generated ** closes foreign content', () => {
		expect(rendered('**<svg>** <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[10, ' a '],
			[41, ' a '],
			[63, ' /a '],
		]);
	});

	test('generated ~~ closes foreign content', () => {
		expect(rendered('~~<svg>~~ <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[10, ' a '],
			[41, ' a '],
			[63, ' /a '],
		]);
	});

	test('unmatched emphasis leaves foreign content open', () => {
		expect(rendered('*<svg> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[7, ' a '],
			[60, ' /a '],
		]);
	});

	test('nested generated emphasis closes foreign content at the inner end tag', () => {
		expect(rendered('***<svg>* <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a --> x**')).toStrictEqual([
			[10, ' a '],
			[41, ' a '],
			[63, ' /a '],
		]);
	});

	test('resolved links close foreign content inside their labels', () => {
		expect(rendered('[<svg>](u) <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[11, ' a '],
			[42, ' a '],
			[64, ' /a '],
		]);
		expect(rendered('[<svg>][r] <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n[r]: u')).toStrictEqual([
			[11, ' a '],
			[42, ' a '],
			[64, ' /a '],
		]);
		expect(rendered('[<svg>] <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[8, ' a '],
			[61, ' /a '],
		]);
	});

	test('generated markup that completes a raw tag opens no element', () => {
		expect(rendered('<div>\n<p><svg\n\nx <x/>\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[23, ' a ', { onCommentLine: true }],
			[54, ' a ', { onCommentLine: true }],
			[76, ' /a ', { onCommentLine: true }],
		]);
		expect(rendered('<div>\n<p><svg\n\nx\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[18, ' a ', { onCommentLine: true }],
			[49, ' a ', { onCommentLine: true }],
			[71, ' /a ', { onCommentLine: true }],
		]);
	});

	test('select ignores unrelated tags until it closes', () => {
		expect(rendered('<div><select></div><svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[24, ' a '],
			[55, ' a '],
			[77, ' /a '],
		]);
		expect(rendered('<div><select></div><svg><![CDATA[ > X<!-- a -->Y ]]>')).toStrictEqual([
			[37, ' a '],
		]);
		expect(rendered('<div><select></select><svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[27, ' a '],
			[80, ' /a '],
		]);
		expect(rendered('<div><select><select><svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[26, ' a '],
			[79, ' /a '],
		]);
		expect(rendered('<div><select><input><svg><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[25, ' a '],
			[78, ' /a '],
		]);
	});

	test('raw heading end tags close foreign content inside generated headings', () => {
		expect(rendered('# <svg></h1><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[12, ' a '],
			[43, ' a '],
			[65, ' /a '],
		]);
		expect(rendered('## <svg></h1><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[13, ' a '],
			[44, ' a '],
			[66, ' /a '],
		]);
		expect(rendered('#      <svg></h1><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[17, ' a '],
			[48, ' a '],
			[70, ' /a '],
		]);
		expect(rendered('#      [x](u) <svg></h1><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[24, ' a '],
			[55, ' a '],
			[77, ' /a '],
		]);
		expect(rendered('x <svg></h2><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n===')).toStrictEqual([
			[12, ' a '],
			[43, ' a '],
			[65, ' /a '],
		]);
	});

	test('table end tags close foreign content inside generated cells', () => {
		expect(rendered('| <svg></th><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a --> |\n| - |')).toStrictEqual([
			[12, ' a '],
			[43, ' a '],
			[65, ' /a '],
		]);
		expect(rendered('| h |\n| - |\n| <svg></td><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a --> |')).toStrictEqual([
			[24, ' a '],
			[55, ' a '],
			[77, ' /a '],
		]);
		expect(rendered('| h |\n| - |\n| <svg></tr><!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a --> |')).toStrictEqual([
			[24, ' a '],
			[55, ' a '],
			[77, ' /a '],
		]);
		expect(rendered('| <svg> | x |\n| - | - |\n| <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a --> | x |')).toStrictEqual([
			[26, ' a '],
			[57, ' a '],
			[79, ' /a '],
		]);
	});

	test('raw list end tags close foreign content inside generated lists', () => {
		expect(rendered('- x <svg></ul> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n  y')).toStrictEqual([
			[15, ' a ', { nextLinePrefix: '  ' }],
			[46, ' a ', { nextLinePrefix: '  ' }],
			[68, ' /a ', { nextLinePrefix: '  ' }],
		]);
		expect(rendered('1. x <svg></ol> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n   y')).toStrictEqual([
			[16, ' a ', { nextLinePrefix: '   ' }],
			[47, ' a ', { nextLinePrefix: '   ' }],
			[69, ' /a ', { nextLinePrefix: '   ' }],
		]);
		expect(rendered('- a\n+ b <svg></ul> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n  y')).toStrictEqual([
			[19, ' a ', { nextLinePrefix: '  ' }],
			[50, ' a ', { nextLinePrefix: '  ' }],
			[72, ' /a ', { nextLinePrefix: '  ' }],
		]);
		expect(rendered('- a\n  - x <svg></ul> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n    y')).toStrictEqual([
			[21, ' a ', { nextLinePrefix: '    ' }],
			[52, ' a ', { nextLinePrefix: '    ' }],
			[74, ' /a ', { nextLinePrefix: '    ' }],
		]);
		expect(rendered('[r] x\n\n- x <svg></ul> <!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->\n\n  y')).toStrictEqual([
			[22, ' a ', { nextLinePrefix: '  ' }],
			[53, ' a ', { nextLinePrefix: '  ' }],
			[75, ' /a ', { nextLinePrefix: '  ' }],
		]);
	});

	test('preserves content after generated paragraph close', () => {
		expect(rendered('x </p><p><svg>\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[16, ' a ', { onCommentLine: true }],
			[47, ' a ', { onCommentLine: true }],
			[69, ' /a ', { onCommentLine: true }],
		]);
	});

	test('preserves content after normalized tag name', () => {
		expect(rendered('<div>\n<x\u0000><svg></x�>\n\n<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->')).toStrictEqual([
			[22, ' a ', { onCommentLine: true }],
			[53, ' a ', { onCommentLine: true }],
			[75, ' /a ', { onCommentLine: true }],
		]);
	});

	test(String.raw`hides the marker in "<svg>\n\ntext\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('<svg>\n\ntext\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<svg><span></svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg><span></svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[29, ' a '],
			[42, ' /a '],
		]);
	});

	test('hides the marker in "<svg></span><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg></span><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<svg></p><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg></p><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[21, ' a '],
			[34, ' /a '],
		]);
	});

	test('hides the marker in "<svg><br><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg><br><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('hides the marker in "<svg><svg></svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg><svg></svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('hides the marker in "<math><mi><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<math><mi><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<svg/><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg/><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[18, ' a '],
			[31, ' /a '],
		]);
	});

	test('renders the marker in "<select><math><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<select><math><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[26, ' a '],
			[39, ' /a '],
		]);
	});

	test('hides the marker in "<select></select><svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<select></select><svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<p><svg></p><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<p><svg></p><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[24, ' a '],
			[37, ' /a '],
		]);
	});

	test('hides the marker in "<SVG><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<SVG><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test(String.raw`renders the marker in "- <svg>\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('- <svg>\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[22, ' a ', { nextLinePrefix: '  ' }],
			[35, ' /a ', { nextLinePrefix: '  ' }],
		]);
	});

	test(String.raw`renders the marker in "> <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('> <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[21, ' a '],
			[34, ' /a '],
		]);
	});

	test('renders the marker in "<em><svg></em><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<em><svg></em><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[26, ' a '],
			[39, ' /a '],
		]);
	});

	test('renders the marker in "*<svg>* <![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('*<svg>* <![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[20, ' a '],
			[33, ' /a '],
		]);
	});

	test('hides the marker in "<svg><desc><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg><desc><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<table><tr><td><svg></td></tr></table><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<table><tr><td><svg></td></tr></table><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[50, ' a '],
			[63, ' /a '],
		]);
	});

	test(String.raw`renders the marker in "<svg>\n</svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('<svg>\n</svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[26, ' a '],
			[39, ' /a '],
		]);
	});

	test(String.raw`renders the marker in "x <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('x <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[21, ' a '],
			[34, ' /a '],
		]);
	});

	test(String.raw`hides the marker in "- <svg>\n\n  para\n\n  <![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('- <svg>\n\n  para\n\n  <![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test(String.raw`hides the marker in "<svg>\n\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('<svg>\n\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test(String.raw`renders the marker in "- x <svg>\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('- x <svg>\n- <![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[24, ' a ', { nextLinePrefix: '  ' }],
			[37, ' /a ', { nextLinePrefix: '  ' }],
		]);
	});

	test(String.raw`renders the marker in "<select>\n\n<svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('<select>\n\n<svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[27, ' a '],
			[40, ' /a '],
		]);
	});

	test('renders the marker in "<div><p><svg></div><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<div><p><svg></div><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[31, ' a '],
			[44, ' /a '],
		]);
	});

	test('renders the marker in "<b><svg></b><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<b><svg></b><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[24, ' a '],
			[37, ' /a '],
		]);
	});

	test('hides the marker in "<table><svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<table><svg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('hides the marker in "<svg><table><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<svg><table><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test(String.raw`renders the marker in "# <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('# <svg>\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[21, ' a '],
			[34, ' /a '],
		]);
	});

	test(String.raw`hides the marker in "<svg>\n\n# x\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>"`, () => {
		expect(rendered('<svg>\n\n# x\n\n<![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
	});

	test('renders the marker in "<svg><noscript><!-- a -->old<!-- /a --></noscript> tail"', () => {
		expect(rendered('<svg><noscript><!-- a -->old<!-- /a --></noscript> tail')).toStrictEqual([
			[15, ' a '],
			[28, ' /a '],
		]);
	});

	test('renders the marker in "<div><span><svg></div><![CDATA[ > <!-- a -->old<!-- /a --> ]]>"', () => {
		expect(rendered('<div><span><svg></div><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[34, ' a '],
			[47, ' /a '],
		]);
	});

	test('detects mixed-case foreign tags after unrelated tag openers', () => {
		expect(rendered('<div></div><sVg><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
		expect(rendered('<div></div><MaTh><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([]);
		expect(rendered('<div></div><![CDATA[ > <!-- a -->old<!-- /a --> ]]>')).toStrictEqual([
			[23, ' a '],
			[36, ' /a '],
		]);
	});

	describe('integration points', () => {
		// GitHub /markdown, 2026-11-17: children of desc, foreignObject, and mi are
		// HTML, and an end tag processed as HTML cannot close past them.
		test('an ignored </desc> leaves HTML content open', () => {
			expect(rendered('<div>\n<svg><desc><b>x</desc><![CDATA[<!--a-->old<!--b-->VIS]]></svg>\n</div>')).toStrictEqual([
				[48, 'b'],
			]);
		});
		test('an HTML element inside desc is HTML content', () => {
			expect(rendered('<div>\n<svg><desc><b>x<![CDATA[<!--a-->old<!--b-->VIS]]></b></desc></svg>\n</div>')).toStrictEqual([
				[41, 'b'],
			]);
		});
		test('an ignored </foreignObject> leaves HTML content open', () => {
			expect(rendered('<div>\n<svg><foreignObject><b>x</foreignObject><![CDATA[<!--a-->old<!--b-->VIS]]></svg>\n</div>')).toStrictEqual([
				[66, 'b'],
			]);
		});
		test('an ignored </mi> leaves HTML content open', () => {
			expect(rendered('<div>\n<math><mi><b>x</mi><![CDATA[<!--a-->old<!--b-->VIS]]></math>\n</div>')).toStrictEqual([
				[45, 'b'],
			]);
		});
		test('desc closes when it is the current node', () => {
			expect(rendered('<div>\n<svg><desc>x</desc><![CDATA[<!--a-->old<!--b-->VIS]]></svg>\n</div>')).toStrictEqual([]);
		});
		test('desc itself is SVG content', () => {
			expect(rendered('<div>\n<svg><desc><![CDATA[<!--a-->old<!--b-->VIS]]></desc></svg>\n</div>')).toStrictEqual([]);
		});
		test('desc closes after its HTML child closes', () => {
			expect(rendered('<div>\n<svg><desc><b>x</b></desc><![CDATA[<!--a-->old<!--b-->VIS]]></svg>\n</div>')).toStrictEqual([]);
		});
		test('an HTML name outside an integration point stays SVG', () => {
			expect(rendered('<div>\n<svg><g><b>x</g><![CDATA[<!--a-->old<!--b-->VIS]]></svg>\n</div>')).toStrictEqual([]);
		});
	});

	describe('implicit closes and scope', () => {
		// GitHub /markdown, 2026-11-17: an end tag that reaches an element
		// closed implicitly, or one outside its scope, must not close the open
		// svg. Each case is followed by CDATA, which is text while the svg
		// stays open and a bogus comment ending at `>` once it closes.
		const document = (markup: string) => `<div>\n${markup}<![CDATA[ > <!-- x -->KEEP ]]></div>`;
		const visible = (markup: string) => expect(rendered(document(markup))).toStrictEqual([]);
		const hidden = (markup: string) => {
			const source = document(markup);
			expect(rendered(source)).toStrictEqual([[source.indexOf('<!-- x'), ' x ']]);
		};

		test('start tags that close an open p', () => {
			for (const name of ['div', 'ul', 'ol', 'dl', 'h1', 'h3', 'table', 'hr', 'pre', 'li', 'dd', 'blockquote', 'details', 'summary', 'form', 'section', 'center', 'address', 'menu', 'main', 'nav', 'fieldset', 'figure', 'figcaption', 'header', 'footer', 'article', 'aside', 'dir', 'hgroup', 'listing']) {
				visible(`<p><${name}><svg></p>`);
			}
			visible('<p><p></p><svg></p>');
		});
		test('start tags that leave a p open', () => {
			// GitHub's parser does not close a p at `search` or `dialog`.
			for (const name of ['search', 'dialog', 'span', 'b', 'a', 'img', 'br']) {
				hidden(`<p><${name}><svg></p>`);
			}
		});
		test('scope boundaries stop an end tag', () => {
			for (const markup of ['<button>', '<object>', '<marquee>', '<applet>', '<template>', '<table><caption>', '<table><th>', '<table><td>']) {
				visible(`<p>${markup}<svg></p>`);
			}
			visible('<div><object><svg></div>');
			visible('<div><table><td><svg></div>');
			visible('<dl><dd><object><svg></dd>');
			visible('<h1><object><svg></h1>');
			visible('<ul><li><object><svg></li>');
			// `button` bounds only `</p>`, and `ul` and `ol` only `</li>`.
			hidden('<div><button><svg></div>');
			visible('<li><ul><svg></li>');
		});
		test('list items, headings, and buttons close their own kind', () => {
			visible('<ul><li><li></li><svg></li>');
			visible('<ul><li><div><li></li><svg></li>');
			visible('<ul><li><p><li></li><svg></li>');
			visible('<ul><li><span><li></li><svg></li>');
			visible('<dl><dd><dt></dt><svg></dd>');
			visible('<dl><dt><dd></dd><svg></dt>');
			visible('<h1><h2></h2><svg></h1>');
			visible('<button><button></button><svg></button>');
			visible('<button><div><button></button><svg></button>');
			// A heading closes only a heading that is the current node.
			hidden('<h1><span><h2></h2><svg></h1>');
		});
		test('any other end tag stops at a special element', () => {
			visible('<span><div><svg></span>');
			visible('<span><p><svg></span>');
			visible('<span><section><svg></span>');
			visible('<span><form><svg></span>');
			// GitHub's parser reads `dialog` and `search` as ordinary elements.
			visible('<dialog><div><svg></dialog>');
			hidden('<span><dialog><svg></span>');
			hidden('<span><search><svg></span>');
		});
		test('table elements', () => {
			// Outside a table, table section and cell tags are ignored.
			hidden('<p><td><svg></p>');
			hidden('<span><tr><svg></span>');
			visible('<span><td><svg></td>');
			// Table end tags close through other boundaries inside the table.
			hidden('<table><tr><td><object><svg></td>');
			hidden('<table><tr><td><object><svg></table>');
		});
		test('table end tags close through integration points', () => {
			// GitHub /markdown, 2026-11-17 (patched gumbo, group 4): `</table>`,
			// `</td>`, and `</template>` use table scope or none, which
			// integration points do not bound.
			hidden('<table><math><mo></table>');
			hidden('<table><svg><desc></table>');
			hidden('<table><td><table></table><math><mtext></td>');
			hidden('<template><math><mn></template>');
		});
		test('formatting elements reopen after an implied close', () => {
			hidden('<p><b><div><svg></b>');
			hidden('<div><b></div><svg></b>');
			hidden('<b><span><svg></b>');
			hidden('<b><div><svg></b>');
		});
		test('rendered paragraphs and inline elements', () => {
			const tail = '<![CDATA[ > <!-- x --> ]]>';
			// A raw `div` closes the paragraph, so its `</p>` finds no p.
			expect(rendered(`text <div><svg>\n\nnext ${tail}`)).toStrictEqual([]);
			expect(rendered(`- a <div><svg>\n\n  b ${tail}`)).toStrictEqual([]);
			expect(rendered(`~~a <div><svg>~~ ${tail}`)).toStrictEqual([]);
			expect(rendered(`text <p><svg>\n\nnext ${tail}`)).toStrictEqual([[32, ' x ']]);
			expect(rendered(`> a <div><svg>\n\nnext ${tail}`)).toStrictEqual([[33, ' x ']]);
			expect(rendered(`- a <div><svg>\n- b ${tail}`)).toStrictEqual([[31, ' x ', { nextLinePrefix: '  ' }]]);
			// The paragraph's em closed with it and reopens around the svg.
			expect(rendered(`*a <div><svg>* ${tail}`)).toStrictEqual([[27, ' x ']]);
		});
		test('obsolete void elements', () => {
			// GitHub /markdown, 2026-11-17: these start tags never stay open,
			// so their end tags do not close the svg, and an enclosing end
			// tag does. `nextid` is an ordinary element.
			for (const name of ['basefont', 'bgsound', 'keygen', 'frame', 'frameset', 'image', 'isindex', 'menuitem', 'param']) {
				visible(`<${name}><svg></${name}>`);
				hidden(`<span><${name}><svg></span>`);
			}
			hidden('<nextid><svg></nextid>');
		});
		test('a foreign select', () => {
			// GitHub /markdown, 2026-11-17: a `select` inside svg is SVG,
			// so it does not stop a later svg from opening.
			visible('<svg><select><foreignObject><i><svg>');
			visible('<select><svg><select><foreignObject><i><svg>');
		});
		test('noscript is special', () => {
			// GitHub /markdown, 2026-11-17: with scripting disabled,
			// noscript content is HTML. `noscript` stops other end tags but is not
			// a scope boundary, and its own end tag stops at a special element.
			expect(rendered('<div>\n<noscript><!-- x --></noscript>\n</div>')).toStrictEqual([[16, ' x ']]);
			visible('<span><noscript><svg></span>');
			visible('<noscript><svg>');
			visible('<noscript><div><svg></noscript>');
			visible('<p><noscript></p><svg></noscript>');
			hidden('<noscript><svg></noscript>');
			hidden('<noscript><span><svg></noscript>');
			hidden('<p><noscript><svg></p>');
		});
		test('a foreign end tag reaches through integration points', () => {
			// GitHub /markdown, 2026-11-17 (patched gumbo, group 5): in foreign
			// content, an end tag finds its element in any foreign run above the
			// nearest HTML element, not only in the current one.
			hidden('<math><mtext><svg></math>');
			hidden('<math><mi><svg></math>');
			hidden('<svg><desc><math></svg>');
			hidden('<object><math><foreignObject><mo><svg></foreignObject></object>');
		});
		test('a heading end tag in foreign content', () => {
			// GitHub /markdown, 2026-11-17 (patched gumbo, group 6): in foreign
			// content, a heading end tag matches names exactly. Processed as HTML,
			// it closes the nearest HTML heading below the foreign ones.
			hidden('<h2><svg><h2></h1>');
			hidden('<h2><math><h2></h1>');
			hidden('<h1><svg><h1></h2>');
			// An exact foreign match wins. Without a match or an HTML heading,
			// the end tag leaves the foreign content open.
			visible('<h1><svg><h2></h2>');
			visible('<svg><h2></h1>');
			hidden('<h1><svg><h2></h3>');
			hidden('<h1><svg><h1></h1></h2>');
			// An HTML heading below an integration point is out of scope, but a
			// heading inside it can close. After a close, the enclosing heading
			// is again the nearest HTML heading.
			visible('<h2><svg><foreignObject><div><svg><h2></h1>');
			hidden('<h1><svg><foreignObject><h2><svg><h1></h3><x>');
			hidden('<h1><span><h2><svg><h1></h3><svg></h4>');
			visible('<div><h1><svg></div><svg></h2>');
		});
		test('svg inside annotation-xml starts an SVG run', () => {
			// GitHub /markdown, 2026-11-17 (patched gumbo, group 10): `ms` inside
			// that svg is SVG, not a MathML integration point, so the HTML name
			// after it stays foreign.
			visible('<math><annotation-xml><svg><ms><b>');
			visible('<math><annotation-xml><svg><ms><form>');
		});
	});
});
