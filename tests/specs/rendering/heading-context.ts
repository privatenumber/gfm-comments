import { describe, test, expect } from 'manten';
import { rendered } from '../../utils/rendered.ts';

describe('heading context', () => {
	test('an ATX heading does not leave a paragraph open', () => {
		expect(rendered('# Heading\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([]);
	});

	test('a setext heading does not leave a paragraph open', () => {
		expect(rendered('Heading\n===\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([]);
	});

	test('a setext dash underline does not leave a paragraph open', () => {
		expect(rendered('Heading\n---\n2. ~~~\n   <!-- x -->example<!-- /x -->\n   ~~~')).toStrictEqual([]);
	});
});
