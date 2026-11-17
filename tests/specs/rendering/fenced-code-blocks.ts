import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('fenced code blocks', () => {
	test('ignores markers inside fenced code blocks', () => {
		expect(rendered('```md\n<!-- a -->example<!-- /a -->\n```')).toStrictEqual([]);
	});

	test('ignores markers inside tilde fences', () => {
		expect(rendered('~~~\n<!-- a -->example<!-- /a -->\n~~~')).toStrictEqual([]);
	});

	test('ignores markers inside an unterminated fence', () => {
		expect(rendered('```\n<!-- a -->example<!-- /a -->')).toStrictEqual([]);
	});

	test('a closing marker inside a fence does not close a marker', () => {
		expect(rendered('<!-- a -->\n```md\n<!-- /a -->\n```\nKEEP\n<!-- /a -->')).toStrictEqual([
			[0, ' a ', { onCommentLine: true }],
			[38, ' /a ', { onCommentLine: true }],
		]);
	});

	test('a closing fence with trailing text does not close the fence', () => {
		expect(rendered('```md\n<!-- a -->example<!-- /a -->\n```not-a-close\n<!-- b -->real<!-- /b -->\n```')).toStrictEqual([]);
	});

	test('a longer fence contains shorter fences', () => {
		expect(rendered('````\n```md\n<!-- a -->example<!-- /a -->\n```\n````')).toStrictEqual([]);
	});

	test('ignores markers in blockquote fences', () => {
		expect(rendered('> ```md\n> <!-- a -->example<!-- /a -->\n> ```')).toStrictEqual([]);
	});

	test('a blockquote fence line inside a top-level fence does not close it', () => {
		expect(rendered('```md\n> ```\n<!-- x -->example<!-- /x -->\n```')).toStrictEqual([]);
	});

	test('a blockquote that ends before its unclosed fence does not hide later markers', () => {
		expect(rendered('> ```\n> code\n\n<!-- x -->real<!-- /x -->')).toStrictEqual([
			[14, ' x ', { onCommentLine: true }],
			[28, ' /x ', { onCommentLine: true }],
		]);
	});

	test('a backtick in a fence info string does not open a fence', () => {
		expect(rendered('``` `\n<!-- x -->real<!-- /x -->\n```')).toStrictEqual([
			[6, ' x ', { onCommentLine: true }],
			[20, ' /x ', { onCommentLine: true }],
		]);
	});

	test('a fence indented to a list item content column is recognized', () => {
		expect(rendered('1. item\n\n    ```\n    <!-- x -->example<!-- /x -->\n    ```')).toStrictEqual([]);
	});

	test('a thematic break does not create list context for a following fence', () => {
		expect(rendered('* * *\n  ~~~md\n<!-- x -->example<!-- /x -->\n  ~~~')).toStrictEqual([]);
	});

	test('a tab-indented line continues a list fence', () => {
		expect(rendered('- item\n\n  ~~~md\n\t<!-- x -->example<!-- /x -->\n  ~~~')).toStrictEqual([]);
	});

	test('a tab after a blockquote marker still opens a fence', () => {
		expect(rendered('>\t~~~md\n> <!-- x -->example<!-- /x -->\n> ~~~')).toStrictEqual([]);
	});

	test('a tab can satisfy indentation for nested list levels', () => {
		expect(rendered('- outer\n  - inner\n    ~~~md\n\t<!-- x -->example<!-- /x -->\n    ~~~')).toStrictEqual([]);
	});

	test('indentation from a blockquote tab cannot close a fence', () => {
		expect(rendered('> ~~~md\n>\t  ~~~\n> <!-- x -->example<!-- /x -->\n> ~~~')).toStrictEqual([]);
	});

	test('indentation from a list tab cannot close a fence', () => {
		expect(rendered('- item\n  ~~~md\n\t  ~~~\n  <!-- x -->example<!-- /x -->\n  ~~~')).toStrictEqual([]);
	});

	test('a fence with mixed space and tab padding is recognized', () => {
		expect(rendered('- \t~~~md\n\t<!-- x -->example<!-- /x -->\n\t~~~')).toStrictEqual([]);
	});

	test('a blank line ends a fence inside a blockquote', () => {
		expect(rendered('> ~~~\n\n> ~~~\n> <!-- x -->example<!-- /x -->\n> ~~~')).toStrictEqual([]);
	});

	test('a blank line continues a fence inside a list item', () => {
		expect(rendered('- ~~~md\n\n  <!-- x -->example<!-- /x -->\n  ~~~')).toStrictEqual([]);
	});

	test('a quote-prefixed blank line keeps a list fence open', () => {
		expect(rendered('> - ~~~\n>\n>   <!-- x -->example<!-- /x -->\n>   ~~~')).toStrictEqual([]);
	});

	test('a list padding tab that overshoots five columns does not open a fence', () => {
		expect(rendered('-\t  ~~~\n\n  ~~~\n  <!-- x -->example<!-- /x -->\n  ~~~')).toStrictEqual([]);
	});
});
