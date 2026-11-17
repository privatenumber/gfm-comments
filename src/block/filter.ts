import { createForwardSearch } from '../utils/forward-search.ts';

/**
 * Decides which text blocks the inline phase lexes. The reference budget lexes
 * every block with brackets and records each failed lookup by its block and
 * its position among the block's lookups. The scanner lexes any of those
 * blocks that can render markup and reads the records back, so both must agree
 * on which blocks have brackets.
 *
 * Blocks must be passed in source order, so each pass needs its own filter.
 */
export const createBlockFilter = (source: string, hasForeignContent: boolean) => {
	const findTagOpen = createForwardSearch(source, '<');
	const findOpenBracket = createForwardSearch(source, '[');
	const findCloseBracket = createForwardSearch(source, ']');
	const findWww = createForwardSearch(source, 'www.');
	const findScheme = createForwardSearch(source, '://');
	const contains = (find: (from: number) => number, segments: number[]) => {
		const found = find(segments[0]);
		return found !== -1 && found < segments.at(-1)!;
	};
	return {

		/**
		 * Raw HTML starts with `<`, so text without one renders as text. With
		 * element tracking, a paragraph's generated `<p>` and `</p>` still matter:
		 * they can complete an unfinished raw tag or close an outer paragraph.
		 */
		needsInline: (segments: number[], type: string) => (
			contains(findTagOpen, segments) || (hasForeignContent && type === 'paragraph')
		),

		/** Whether a reference lookup can happen in the block. */
		hasBrackets: (segments: number[]) => (
			contains(findOpenBracket, segments) && contains(findCloseBracket, segments)
		),

		/** Whether a bare autolink, which starts with `www.` or has `://`, can match. */
		hasBareAutolink: (segments: number[]) => (
			contains(findWww, segments) || contains(findScheme, segments)
		),
	};
};
