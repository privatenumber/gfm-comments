import { escapeHref } from './escape.ts';

/**
 * Footnotes, as GitHub renders them with cmark-gfm 0.29.0.gfm.13's footnote
 * option. The renderer moves each referenced definition to a list at the end
 * of the document, in the order of first reference, and drops the others:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/blocks.c#L465-L545
 *
 * The markup below is the renderer's, byte for byte, so the HTML tokenizer can
 * read it in any state. The one exception is `renderTail`, which stops after
 * the second backlink because the rest cannot change the tokenizer:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/html.c#L62-L102
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/html.c#L422-L456
 */

export type FootnoteDefinition = {

	/** The raw label, as the renderer writes it in `id` and `href`. */
	label: string;

	/** The position in the list of rendered footnotes, from 1, or 0 if unreferenced. */
	index: number;

	/** The number of references to the definition. */
	references: number;

	/** The number of references rendered so far. */
	rendered: number;
	lastIsParagraph: boolean;

	/** Whether markup follows the last HTML block line of the content. */
	markup: boolean;
};

/**
 * `reference` is the reference's number among those to the definition. It
 * counts in replay order, which can differ from the renderer's document
 * order, but its digits cannot change the tokenizer's state.
 */
export const renderReference = (definition: FootnoteDefinition, reference: number) => {
	const label = escapeHref(definition.label);
	const suffix = reference > 1 ? `-${reference}` : '';
	return `<sup class="footnote-ref"><a href="#fn-${label}" id="fnref-${label}${suffix}" data-footnote-ref>${definition.index}</a></sup>`;
};

export const renderHead = (definition: FootnoteDefinition, first: boolean) => (
	`${first ? '<section class="footnotes" data-footnotes>\n<ol>\n' : ''}<li id="fn-${escapeHref(definition.label)}">\n`
);

/**
 * The backlinks, inside the last paragraph when the content ends with one.
 *
 * Only the first two backlinks are written, because the rest cannot change
 * the tokenizer, and writing all of them takes n log n characters for n
 * references. A comment, single-quoted value, or CDATA section stays open
 * through every backlink, which holds none of `-->`, `--!>`, `'`, and `]]>`.
 * From any other state, the first backlink's `"` ends a double-quoted value
 * and its `>` ends a tag or bogus comment, so it ends in the data state. From
 * the data state, a numbered backlink opens `a` and `sup` and closes them in
 * reverse order, which leaves the element stack as it was. Later backlinks
 * differ from the second only in digits, which change no transition.
 */
export const renderTail = (definition: FootnoteDefinition) => {
	const label = escapeHref(definition.label);
	const { index } = definition;
	let backlinks = `<a href="#fnref-${label}" class="footnote-backref" data-footnote-backref data-footnote-backref-idx="${index}" aria-label="Back to reference ${index}">↩</a>`;
	if (definition.references > 1) {
		backlinks += ` <a href="#fnref-${label}-2" class="footnote-backref" data-footnote-backref data-footnote-backref-idx="${index}-2" aria-label="Back to reference ${index}-2">↩<sup class="footnote-ref">2</sup></a>`;
	}
	return definition.lastIsParagraph
		? ` ${backlinks}</p>\n</li>\n`
		: `${backlinks}\n</li>\n`;
};

export const footnotesEnd = '</ol>\n</section>\n';
