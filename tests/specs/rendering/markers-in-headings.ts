import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('markers in headings', () => {
	test('finds a marker on an ATX heading line', () => {
		expect(rendered('# <!-- title -->Old<!-- /title -->')).toStrictEqual([
			[2, ' title '],
			[19, ' /title '],
		]);
	});

	test('ignores a marker example in inline code on a heading line', () => {
		expect(rendered('# `<!-- title -->example<!-- /title -->`')).toStrictEqual([]);
	});

	test('finds a marker on a heading inside a blockquote', () => {
		expect(rendered('# <!-- title -->Old<!-- /title -->')).toStrictEqual([
			[2, ' title '],
			[19, ' /title '],
		]);
	});

	test('finds a marker on a heading inside a list item', () => {
		expect(rendered('- # <!-- title -->Old<!-- /title -->')).toStrictEqual([
			[4, ' title ', { nextLinePrefix: '  ' }],
			[21, ' /title ', { nextLinePrefix: '  ' }],
		]);
	});
});
