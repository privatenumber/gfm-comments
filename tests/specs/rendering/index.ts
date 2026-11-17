import { describe } from 'manten';

// Each case checks the comments that GitHub renders for a source. The cases
// come from comment-mark's Markdown tests, which explain why each one renders
// as it does:
// https://github.com/privatenumber/comment-mark/blob/96765d2/tests/specs/markdown.ts
describe('rendering', () => {
	import('./bare-autolinks.ts');
	import('./reference-expansion-budget.ts');
	import('./comment-and-code-boundaries.ts');
	import('./block-comments.ts');
	import('./empty-comments.ts');
	import('./parse-error-comments.ts');
	import('./comments-that-span-lines.ts');
	import('./early-exit.ts');
	import('./fenced-code-blocks.ts');
	import('./inline-code.ts');
	import('./links-and-images.ts');
	import('./paragraph-interruption.ts');
	import('./heading-context.ts');
	import('./markers-in-headings.ts');
	import('./github-rendering.ts');
	import('./table-cells.ts');
	import('./link-and-cell-markup.ts');
	import('./generated-block-markup.ts');
	import('./foreign-content.ts');
	import('./line-endings.ts');
	import('./footnotes.ts');
});
