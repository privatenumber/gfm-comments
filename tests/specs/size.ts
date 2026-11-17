import { describe, test, expect } from 'manten';
import { measureBundle } from '../../bench/size/bundle.ts';
import { SIZE_BUDGET } from '../../bench/size/budget.ts';

describe('bundle size', () => {
	test('minified and gzip output stay within the budget', async () => {
		const size = await measureBundle();
		expect(size.minified).toBeLessThanOrEqual(SIZE_BUDGET.minified);
		expect(size.gzip).toBeLessThanOrEqual(SIZE_BUDGET.gzip);
	});
});
