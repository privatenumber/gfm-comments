import { createBlockFilter } from './block/filter.ts';
import {
	type ContainerName,
	type GeneratedBlock,
	lexBlocks,
	type TableAlignment,
} from './block/index.ts';
import { createReferenceBudget } from './budget.ts';
import { type Comment, createHtmlTokenizer } from './html/tokenizer.ts';
import { type InlineFootnotes, type InlineLinks, lexInline } from './inline/index.ts';
import { advanceRemoved, joinText } from './inline/text.ts';
import { normalizeLabel } from './references/label.ts';
import { renderGeneratedBlock } from './render/code-block.ts';
import {
	type FootnoteDefinition,
	footnotesEnd,
	renderHead,
	renderReference,
	renderTail,
} from './render/footnote.ts';
import {
	type LinkTarget, renderAutolink, renderImage, renderLinkOpen,
} from './render/link.ts';
import { toAsciiLower } from './utils/ascii.ts';
import { createForwardSearch } from './utils/forward-search.ts';

export type { Comment };

/**
 * Finds the HTML comments that GitHub renders when it displays `source` as
 * Markdown, sorted by `start`. The ranges never overlap, so replacements
 * applied from the last comment to the first keep earlier offsets valid.
 *
 * A `<!--` is skipped wherever GitHub shows it as text or code instead: in
 * code blocks and code spans, link destinations, reference definitions,
 * escaped text, and inside open HTML tags. The rules model GitHub's renderer,
 * cmark-gfm 0.29.0.gfm.13, and GitHub's HTML handling.
 *
 * Every comment the browser builds from GitHub's output is returned,
 * including the parse errors that still produce one: the empty `<!-->` and
 * `<!--->`, a comment closed by `--!>`, and a comment that is never closed,
 * which hides the rest of the document or of its footnote definition.
 */
export const findComments = (source: string): Comment[] => {
	const lastCommentOpen = source.lastIndexOf('<!--');
	return lastCommentOpen === -1 ? [] : scanDocument(source, lastCommentOpen);
};

type TextType = 'paragraph' | 'heading' | 'cell';

// A block phase event, held for replay once a lookup can need every label.
type BlockEvent =
	| {
		type: 'text';
		segments: number[];
		nextLinePrefix: string;
		unescapePipes: boolean;
		textType: TextType;
		// The block has no `<`, so only its links, images, autolinks, and
		// footnote references render markup, which matters only outside the
		// data state.
		generatedOnly: boolean;
	}
	| {
		type: 'html';
		// Adjacent lines of one HTML block share an event; replay splits them.
		start: number;
		end: number;
		afterMarkup: boolean;
		nextLinePrefix: string;
	}
	| {
		type: 'open' | 'close';
		name: ContainerName;
	}
	| {
		type: 'cell';
		name: 'th' | 'td';
		align: TableAlignment;
	}
	| {
		type: 'generated';
		block: GeneratedBlock;
		afterMarkup: boolean;
	};

type Footnote = FootnoteDefinition & {
	events: BlockEvent[];

	/** The source range of the definition: its `[^` to the line after it. */
	start: number;
	end: number;
};

const codeElements = ['pre', 'code', '/code', '/pre'];
const linkOpenElements = ['a'];
const linkCloseElements = ['/a'];
const noElements: string[] = [];
const cellElements = {
	th: ['th'],
	td: ['td'],
};
const renderLinkClose = () => '</a>';

/**
 * Scans the source without building a tree, in three phases:
 *
 * 1. The block phase finds the leaf blocks: paragraphs, headings, table cells,
 *    HTML blocks, and code, which never holds a comment.
 * 2. The inline phase finds the raw HTML spans in the text of each paragraph,
 *    heading, and cell. Other text renders escaped and cannot hold a comment.
 * 3. The browser phase reads HTML blocks and raw HTML spans as a browser would
 *    and reports the comments.
 *
 * The renderer moves referenced footnote definitions to the end of the
 * document, so their events are held and replayed after the rest.
 *
 * The rules each phase leaves out are listed in
 * notes/gfm-comments/known-gaps.md.
 */
const scanDocument = (source: string, lastCommentOpen: number): Comment[] => {
	// One native search per `<` costs nothing measurable on real documents.
	// Lowercasing a copy or searching for the names cost more; see the notes.
	let hasForeignContent = false;
	const asciiLower = (index: number) => toAsciiLower(source.charCodeAt(index));
	for (let index = source.indexOf('<'); index !== -1; index = source.indexOf('<', index + 1)) {
		const first = asciiLower(index + 1);
		if (
			(first === 115 && asciiLower(index + 2) === 118 && asciiLower(index + 3) === 103)
			|| (first === 109 && asciiLower(index + 2) === 97
				&& asciiLower(index + 3) === 116 && asciiLower(index + 4) === 104)
		) {
			hasForeignContent = true;
			break;
		}
	}
	const comments: Comment[] = [];
	const tokenizer = createHtmlTokenizer(source, comments, hasForeignContent);
	const labels = new Map<string, LinkTarget>();

	// A footnote definition seen anywhere can be referenced later, and its
	// events then replay after the rest, so it blocks the early stop even
	// after the last `<!--`.
	let sawFootnote = false;
	const footnoteLabels = new Map<string, Footnote>();
	const openFootnotes: Footnote[] = [];
	// Referenced definitions, in the order they render.
	const renderedFootnotes: Footnote[] = [];
	const findFootnote = (label: string) => footnoteLabels.get(normalizeLabel(label));
	let footnotes: InlineFootnotes<Footnote> | undefined;
	let failures: Map<number, Set<number>> | undefined;
	let activeFailures: Set<number> | undefined;
	let lookupOrdinal = 0;
	const lookupLabel = (label: string) => {
		const normalized = normalizeLabel(label);
		const failed = activeFailures?.has(lookupOrdinal);
		lookupOrdinal += 1;
		return failed || normalized === '' ? undefined : labels.get(normalized);
	};

	// Whether generated markup precedes the next raw HTML span of the text
	// block being lexed: the block's opening tag, or an element that is
	// approximated. Exact markup, such as a link's tags, consumes it.
	let inlineAfterMarkup = false;
	const links: InlineLinks = {
		inData: () => !tokenizer.wantsCode(),
		open: (target) => {
			tokenizer.generated(inlineAfterMarkup, linkOpenElements, () => renderLinkOpen(target));
			inlineAfterMarkup = false;
		},
		close: () => {
			tokenizer.generated(inlineAfterMarkup, linkCloseElements, renderLinkClose);
			inlineAfterMarkup = false;
		},
		// Images and autolinks were never tracked as elements, so they pass none.
		image: (target) => {
			tokenizer.generated(inlineAfterMarkup, noElements, () => renderImage(target));
			inlineAfterMarkup = false;
		},
		autolink: (text, start, end) => {
			tokenizer.generated(inlineAfterMarkup, noElements, () => renderAutolink(text, start, end));
			inlineAfterMarkup = false;
		},
	};
	const inlineElement = hasForeignContent
		? (name: 'em' | 'strong' | 'del', open: boolean) => {
			if (open) {
				tokenizer.open(name);
			} else {
				tokenizer.close(name);
			}
			inlineAfterMarkup = true;
		}
		: undefined;

	const lexText = ({
		segments,
		nextLinePrefix,
		unescapePipes,
		textType,
	}: Extract<BlockEvent, { type: 'text' }>) => {
		if (textType === 'paragraph') {
			tokenizer.open('p');
		}
		activeFailures = failures?.get(segments[0]);
		lookupOrdinal = 0;
		// The inline phase reads the lines joined by line feeds. `textStarts`
		// maps each line back to its source position; `removed` records inline
		// offsets of backslashes removed before pipes.
		const textStarts: number[] = [];
		const removed: number[] = [];
		const text = joinText(source, segments, textStarts, unescapePipes, removed);

		let line = 0;
		let removedBeforeStart = 0;
		let removedBeforeEnd = 0;
		let removedBeforeLine = 0;
		// The block's opening tag, such as `<p>`, comes before its first span.
		// Text between spans renders escaped, so it holds no markup.
		inlineAfterMarkup = true;
		lexInline(text, (start, end) => {
			while (line + 1 < textStarts.length && textStarts[line + 1] <= start) {
				line += 1;
			}
			// A span can cross lines. Each part is fed as one line of the chunk.
			for (let part = line; part < textStarts.length && textStarts[part] < end; part += 1) {
				const lineStart = segments[part * 2];
				const startOffset = Math.max(start, textStarts[part]);
				const lineEnd = part + 1 < textStarts.length ? textStarts[part + 1] - 1 : text.length;
				const endOffset = Math.min(end, lineEnd);
				removedBeforeLine = advanceRemoved(removed, removedBeforeLine, textStarts[part]);
				removedBeforeStart = advanceRemoved(removed, removedBeforeStart, startOffset + 1);
				removedBeforeEnd = advanceRemoved(removed, removedBeforeEnd, endOffset);
				const sourceStart = lineStart + removedBeforeStart - removedBeforeLine;
				const sourceEnd = lineStart + removedBeforeEnd - removedBeforeLine;
				const partStart = startOffset - textStarts[part] + sourceStart;
				const partEnd = endOffset - textStarts[part] + sourceEnd;
				tokenizer.feed(partStart, partEnd, inlineAfterMarkup, nextLinePrefix, false);
				inlineAfterMarkup = false;
			}
		}, lookupLabel, inlineElement, footnotes, links);
		if (textType === 'paragraph') {
			tokenizer.close('p');
		}
	};

	// Searches for the line endings inside a combined HTML event.
	const findLineFeed = createForwardSearch(source, '\n');
	const findCarriageReturn = createForwardSearch(source, '\r');
	const feedHtml = (start: number, end: number, afterMarkup: boolean, nextLinePrefix: string) => {
		let lineStart = start;
		for (;;) {
			const lf = findLineFeed(lineStart);
			const cr = findCarriageReturn(lineStart);
			const lineEnd = Math.min(lf === -1 ? end : lf, cr === -1 ? end : cr, end);
			if (lineEnd === end) {
				break;
			}
			tokenizer.feed(lineStart, lineEnd, afterMarkup, nextLinePrefix, true);
			afterMarkup = false;
			lineStart = lineEnd + (source.startsWith('\r\n', lineEnd) ? 2 : 1);
		}
		tokenizer.feed(lineStart, end, afterMarkup, nextLinePrefix, true);
	};

	const dispatch = (event: BlockEvent) => {
		switch (event.type) {
			case 'text': {
				// In the data state, the markup of such a block changes nothing.
				if (!event.generatedOnly || tokenizer.wantsCode()) {
					lexText(event);
				}
				break;
			}
			case 'html': {
				feedHtml(event.start, event.end, event.afterMarkup, event.nextLinePrefix);
				break;
			}
			case 'open': {
				tokenizer.open(event.name);
				break;
			}
			case 'close': {
				tokenizer.close(event.name);
				break;
			}
			case 'cell': {
				const { name, align } = event;
				// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/table.c#L798-L814
				tokenizer.generated(true, cellElements[name], () => `<${name} align="${align}">`);
				break;
			}
			case 'generated': {
				const { block } = event;
				tokenizer.generated(event.afterMarkup, block.type === 'code' ? codeElements : noElements, () => renderGeneratedBlock(source, block));
				break;
			}
			default: {
				// Every event type has a case.
				event satisfies never;
			}
		}
	};

	// Block events go straight to the other phases until a block holds a
	// possible reference. From then on, they are held until every definition
	// is known.
	// A footnote definition's events are always held, in its own list.
	const events: BlockEvent[] = [];
	let buffering = false;
	// Whether replay can leave the data state before the next held event: the
	// tokenizer was outside it when holding began, or an HTML line or a block
	// with raw HTML that `keepsData` or `inlineKeepsData` can't vouch for is
	// held. Other events leave the data state as it is.
	let heldLeavesData = false;
	const findProcessingInstruction = createForwardSearch(source, '<?');
	const findMarkupDeclaration = createForwardSearch(source, '<![');
	const findBangClose = createForwardSearch(source, '--!>');
	// Whether a block's raw HTML, read from the data state, ends in it. An
	// inline tag or declaration ends where the browser ends it, and so does a
	// comment, unless it holds `--!>`: cmark-gfm ends it at a later `-->`.
	// A processing instruction or CDATA section ends at its first `>` in the
	// browser, outside foreign content. In each case, text after the
	// browser's end can open a tag.
	const inlineKeepsData = (segments: number[]) => {
		const start = segments[0];
		const end = segments.at(-1)!;
		const isAfter = (index: number) => index === -1 || index >= end;
		return isAfter(findProcessingInstruction(start))
			&& isAfter(findMarkupDeclaration(start))
			&& isAfter(findBangClose(start));
	};
	const findLineTagOpen = createForwardSearch(source, '<');
	const findLineCommentEnd = createForwardSearch(source, '-->');
	// Whether an HTML block line read from the data state ends in it: it has
	// no `<`, or its only `<` opens a comment that closes on the line. Such
	// lines, like `<!-- prettier-ignore -->`, are common between reference
	// links and large tables. Lines must be passed in source order.
	const keepsData = (start: number, end: number) => {
		const open = findLineTagOpen(start);
		if (open === -1 || open >= end) {
			return true;
		}
		if (!source.startsWith('<!--', open)) {
			return false;
		}
		// `<!-->` and `<!--->` also close at once.
		const close = findLineCommentEnd(open + 2);
		if (close === -1 || close + 3 > end) {
			return false;
		}
		// A `--!>` before `-->` closes the comment too, and the text after it
		// has no `<` either.
		const next = findLineTagOpen(open + 1);
		return next === -1 || next >= end;
	};
	const record = (event: BlockEvent) => {
		const footnote = openFootnotes.at(-1);
		if (footnote) {
			footnote.events.push(event);
		} else if (buffering) {
			heldLeavesData ||= event.type === 'text' && !event.generatedOnly && !inlineKeepsData(event.segments);
			events.push(event);
		} else {
			dispatch(event);
		}
	};
	// Whether output that matters only outside the data state can matter at
	// the current block. Outside a footnote definition, held events replay in
	// order, so the state stays as the tokenizer has it until one can leave it.
	const mayLeaveData = () => (
		openFootnotes.length > 0 || (buffering && heldLeavesData) || tokenizer.wantsCode()
	);
	const filter = createBlockFilter(source, hasForeignContent);
	// Past the last `<!--`, no later line can start a comment, so the block
	// phase can stop once nothing pending can change a comment it already
	// found:
	// - `buffering` is false, so no event is held for replay and no reference
	//   lookup is deferred. A definition later in the source therefore cannot
	//   resolve a reference that was already lexed.
	// - No footnote definition was seen, because a later reference could
	//   render one and replay its comments at the end.
	// - The tokenizer is in the data state, so no open comment, tag, or
	//   attribute needs text after the last `<!--` to end it.
	// The block phase additionally waits for an open paragraph or heading
	// that started at or before the marker, since its text has not reached the
	// tokenizer and may hold the marker. Code renders escaped and HTML lines
	// are fed as they are read, so those leaves can stop early. The loop reads
	// one line per `processLine` call, and a stopped phase skips the rest of
	// the source.
	const markup = lexBlocks(source, {
		wantsCode: mayLeaveData,
		generated: (block, afterMarkup) => record({
			type: 'generated',
			block,
			afterMarkup,
		}),
		text: (segments, nextLinePrefix, unescapePipes, textType) => {
			if (segments.length === 0) {
				return;
			}
			const inline = filter.needsInline(segments, textType);
			// Without raw HTML, only a link, image, autolink, or footnote reference
			// can render markup, and its elements close as they open, so it matters
			// only outside the data state.
			if (!inline && !mayLeaveData()) {
				return;
			}
			const brackets = filter.hasBrackets(segments);
			if (!inline && !brackets && !filter.hasBareAutolink(segments)) {
				return;
			}
			// A footnote definition's events are held in its own list, and its
			// references are counted by the reference budget's own pass, so its
			// brackets do not hold the main document.
			if (brackets && !buffering && openFootnotes.length === 0) {
				buffering = true;
				heldLeavesData = tokenizer.wantsCode();
			}
			record({
				type: 'text',
				segments,
				nextLinePrefix,
				unescapePipes,
				textType,
				generatedOnly: !inline,
			});
		},
		html: (start, end, afterMarkup, nextLinePrefix) => {
			// Replay can go back in the source after a footnote definition, where
			// the line searches in `feedHtml` only stay exact for single lines,
			// so lines in a definition are not combined.
			if (openFootnotes.length === 0) {
				// A streamed line needs no split. Skipping `feedHtml` here saved 14%
				// on 300,000 HTML block lines (2026-11-16).
				if (!buffering) {
					tokenizer.feed(start, end, afterMarkup, nextLinePrefix, true);
					return;
				}
				heldLeavesData ||= !keepsData(start, end);
				const last = events.at(-1);
				if (
					last?.type === 'html' && !afterMarkup
					&& last.nextLinePrefix === nextLinePrefix
					&& ((start - last.end === 1
						&& (source.charCodeAt(last.end) === 10 || source.charCodeAt(last.end) === 13))
						|| (start - last.end === 2 && source.startsWith('\r\n', last.end)))
				) {
					last.end = end;
					return;
				}
			}
			record({
				type: 'html',
				start,
				end,
				afterMarkup,
				nextLinePrefix,
			});
		},
		open: hasForeignContent
			? name => record({
				type: 'open',
				name,
			})
			: undefined,
		close: hasForeignContent
			? name => record({
				type: 'close',
				name,
			})
			: undefined,
		alignedCell: (name, align) => record({
			type: 'cell',
			name,
			align,
		}),
		definition: (label, destination, title) => {
			const normalized = normalizeLabel(label);
			if (normalized && !labels.has(normalized)) {
				labels.set(normalized, {
					destination,
					title,
				});
			}
		},
		footnoteStart: (label, start) => {
			sawFootnote = true;
			openFootnotes.push({
				start,
				end: source.length,
				label: label.replaceAll('\0', '\uFFFD'),
				index: 0,
				references: 0,
				rendered: 0,
				lastIsParagraph: false,
				markup: false,
				events: [],
			});
		},
		// `process_footnotes` registers definitions as they close, and the first
		// with each label wins.
		footnoteEnd: (lastIsParagraph, footnoteMarkup, end) => {
			const footnote = openFootnotes.pop()!;
			footnote.end = end;
			footnote.lastIsParagraph = lastIsParagraph;
			footnote.markup = footnoteMarkup;
			const normalized = normalizeLabel(footnote.label);
			if (normalized && !footnoteLabels.has(normalized)) {
				footnoteLabels.set(normalized, footnote);
			}
		},
	}, {
		after: lastCommentOpen,
		canStop: () => !buffering && !sawFootnote && !tokenizer.inComment(),
	});
	// Only replayed events look up labels, and without definitions no lookup
	// resolves, so none can exceed the budget. Footnote references need the
	// pass to number the definitions.
	if (footnoteLabels.size > 0 || (buffering && labels.size > 0)) {
		failures = createReferenceBudget(source, labels, footnoteLabels.size > 0
			? {
				find: findFootnote,
				count: (footnote) => {
					if (footnote.index === 0) {
						renderedFootnotes.push(footnote);
						footnote.index = renderedFootnotes.length;
					}
					footnote.references += 1;
				},
			}
			: undefined);
	}
	if (renderedFootnotes.length > 0) {
		footnotes = {
			find: findFootnote,
			emit: (footnote) => {
				footnote.rendered += 1;
				const reference = footnote.rendered;
				tokenizer.generated(false, noElements, () => renderReference(footnote, reference));
			},
		};
	}
	for (const event of events) {
		dispatch(event);
	}
	for (const [position, footnote] of renderedFootnotes.entries()) {
		tokenizer.boundary();
		tokenizer.generated(
			position === 0 && markup,
			position === 0 ? ['section', 'ol', 'li'] : ['li'],
			() => renderHead(footnote, position === 0),
		);
		for (const event of footnote.events) {
			dispatch(event);
		}
		tokenizer.generated(footnote.markup, ['/li'], () => renderTail(footnote));
	}
	if (renderedFootnotes.length > 0) {
		tokenizer.generated(false, ['/ol', '/section'], () => footnotesEnd);
	}
	tokenizer.finish();
	// A rendered footnote replays at the end, so its comments can arrive out
	// of source order. An unreferenced definition never replays, so its
	// comments never reach the tokenizer.
	if (renderedFootnotes.length > 0) {
		comments.sort((a, b) => a.start - b.start);
		// A reported range must not cross the start or end of a rendered
		// definition, because the renderer moves the definition's content away
		// from the text around it. A comment ends at the first such boundary
		// after its opening, with no closer, which keeps the ranges disjoint.
		const boundaries: number[] = [];
		for (const footnote of renderedFootnotes) {
			boundaries.push(footnote.start, footnote.end);
		}
		boundaries.sort((a, b) => a - b);
		let next = 0;
		for (const comment of comments) {
			while (next < boundaries.length && boundaries[next] <= comment.start) {
				next += 1;
			}
			if (next < boundaries.length && boundaries[next] < comment.end) {
				comment.contentEnd = boundaries[next];
				comment.end = boundaries[next];
			}
		}
	}
	return comments;
};
