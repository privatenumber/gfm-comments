import { scanLabel } from '../references/label.ts';
import type { LinkTarget } from '../render/link.ts';
import { isAsciiPunctuation, isCmarkSpace } from '../utils/ascii.ts';
import { matchBareAutolink } from './bare-autolink.ts';
import { createEmphasis, type Delimiter } from './emphasis.ts';
import { decodeReferenceLabel, scanCaret } from './footnote-reference.ts';
import { createLinkTailMatcher, matchAutolink } from './links.ts';
import { createRawHtmlMatcher } from './raw-html.ts';

/**
 * The inline phase. It finds the raw HTML spans in the text of one paragraph,
 * heading, or table cell, as `handle_pointy_brace` in GitHub's renderer does:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L911-L1018
 *
 * It lexes the inline rules that decide where raw HTML can start: backslash
 * escapes, code spans, autolinks, links and images, and footnote references.
 * Everything else renders as escaped text or renderer-generated markup, neither
 * of which can open a comment.
 */

// `MAXBACKTICKS`: a longer run is literal text.
// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L34
const maxBacktickRun = 80;

type LinkSpan = {
	type: 'link';
	image: boolean;
	state: 'pending' | 'open' | 'close';
	target: LinkTarget | undefined;
};

type Span =
	| {
		type: 'html';
		start: number;
		end: number;
	}
	| LinkSpan
	| {
		type: 'delimiter';
		delimiter: Delimiter;
	}
	| {
		type: 'footnote';
		definition: unknown;
	}
	| {
		type: 'autolink';
		start: number;
		end: number;
	};

/**
 * Resolves footnote reference labels. `emit` receives each rendered
 * reference in order with the raw HTML spans. `count` receives each reference
 * that stays in the tree, which includes those inside image descriptions.
 */
export type InlineFootnotes<T> = {
	find: (label: string) => T | undefined;
	emit?: ((definition: T) => void) | undefined;
	count?: ((definition: T) => void) | undefined;
};

/**
 * Receives the markup of each resolved link, image, and autolink, in order
 * with the raw HTML spans. In the data state, a link's opening tag only opens
 * an element, which matters only with `element`, and an image or autolink
 * changes nothing. So they are tracked only when `inData` is false, earlier
 * spans are held, or a link's element matters.
 */
export type InlineLinks = {
	inData: () => boolean;
	open: (target: LinkTarget) => void;
	close: () => void;

	/** A resolved image, whose markup is written whole at its `![`. */
	image: (target: LinkTarget) => void;

	/** An angle or bare autolink that `matchAutolink` or `matchBareAutolink` matched. */
	autolink: (text: string, start: number, end: number) => void;
};

/**
 * Calls `emit` with the start and end of each raw HTML span in `text`, in order.
 * `lookupLabel` returns the definition of a reference label, or undefined.
 * Without `footnotes`, every footnote reference is undefined. An undefined
 * reference still drops the inlines in its brackets.
 */
export const lexInline = <T>(
	text: string,
	emit: (start: number, end: number) => void,
	lookupLabel: (label: string) => LinkTarget | undefined,
	element?: (name: 'em' | 'strong' | 'del', open: boolean) => void,
	footnotes?: InlineFootnotes<T>,
	links?: InlineLinks,
) => {
	const matchRawHtml = createRawHtmlMatcher(text);

	// Code spans: each maximal backtick run, found on first use. A span closes at
	// the next run of the same length; backslashes do not escape inside one.
	let runStarts: number[] | undefined;
	const runLengths: number[] = [];
	let currentRun = 0;
	const lastBacktick = new Map<number, number>();
	let scannedBackticks = false;

	const findRuns = () => {
		const starts: number[] = [];
		let index = text.indexOf('`');
		while (index !== -1) {
			const start = index;
			while (text.charCodeAt(index) === 96) {
				index += 1;
			}
			starts.push(start);
			runLengths.push(index - start);
			index = text.indexOf('`', index);
		}
		return starts;
	};

	/** Returns the index after the code span or literal backticks at `index`. */
	const skipBackticks = (index: number) => {
		runStarts ??= findRuns();
		while (runStarts[currentRun] + runLengths[currentRun] <= index) {
			currentRun += 1;
		}
		// An escaped backtick leaves the rest of its run as the opener.
		const length = runStarts[currentRun] + runLengths[currentRun] - index;
		if (length > maxBacktickRun) {
			return index + length;
		}
		if (scannedBackticks && (lastBacktick.get(length) ?? 0) <= index + length) {
			return index + length;
		}
		// Like `scan_to_closing_backticks`, record every run passed. After one
		// scan reaches the end, a scan runs only when the cache shows a closer, so
		// scans never overlap.
		let next = currentRun + 1;
		while (next < runStarts.length && runLengths[next] !== length) {
			lastBacktick.set(runLengths[next], runStarts[next]);
			next += 1;
		}
		if (next === runStarts.length) {
			scannedBackticks = true;
			return index + length;
		}
		lastBacktick.set(length, runStarts[next]);
		return runStarts[next] + length;
	};

	const { matchLinkTail, inlineTarget } = createLinkTailMatcher(text);
	// The definition that `matchReference` matched last, or undefined after
	// `matchLinkTail` matched an inline link. A span builds its target lazily.
	let linkTarget: LinkTarget | undefined;

	// A completed link sets one shared flag; a later `[` clears it, so even an
	// older link opener may become usable again.
	// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1136-L1349
	const brackets: {
		image: boolean;
		spanStart: number;
		link: LinkSpan | undefined;
		position: number;
		bracketAfter: boolean;
		// The end of the `^` that makes the bracket a possible footnote
		// reference, or -1.
		caret: number;
		boundaryStart: number;
		referenceStart: number;
	}[] = [];
	// Raw HTML spans and generated elements, held while a bracket or emphasis
	// is unresolved. A link opener stays `pending` until its bracket closes.
	const spans: Span[] = [];
	let emphasis: ReturnType<typeof createEmphasis> | undefined;
	let images = 0;
	let noLinkOpeners = true;
	// Open brackets with a pending link span, whose opening tag waits for the
	// bracket to close, so the spans after it are held.
	let linkSpans = 0;

	// Open brackets that may become footnote references. A reference drops the
	// inlines inside it, so spans wait until these close.
	let carets = 0;
	// While one is open, the starts of the inlines that end a reference label:
	// line breaks, code spans, autolinks, raw HTML, and completed brackets.
	const tracksLabels = footnotes !== undefined;
	const boundaries: number[] = [];
	// Callers check `carets > 0` first, which keeps the common path short.
	const addBoundary = (position: number) => {
		if (tracksLabels) {
			boundaries.push(position);
		}
	};
	// The references that stay in the tree, in order, when they are counted.
	const references: T[] | undefined = footnotes?.count ? [] : undefined;

	const pushBracket = (image: boolean) => {
		if (brackets.length > 0) {
			brackets.at(-1)!.bracketAfter = true;
		}
		// With no spans held, the tokenizer is in the state the markup meets.
		const link: LinkSpan | undefined = links
			&& ((element && !image) || spans.length > 0 || !links.inData())
			? {
				type: 'link',
				image,
				state: 'pending',
				target: undefined,
			}
			: undefined;
		const position = index + (image ? 2 : 1);
		const caret = scanCaret(text, position);
		if (caret !== -1) {
			carets += 1;
		}
		brackets.push({
			image,
			spanStart: spans.length,
			link,
			position,
			bracketAfter: false,
			caret,
			boundaryStart: boundaries.length,
			referenceStart: references?.length ?? 0,
		});
		if (link) {
			spans.push(link);
			linkSpans += 1;
		}
		if (image) {
			images += 1;
		} else {
			noLinkOpeners = false;
		}
	};
	// The reference replaces the inlines inside the brackets that `opener`
	// opened, and `index` is after the closing bracket.
	const addReference = (opener: (typeof brackets)[number]) => {
		spans.length = opener.spanStart;
		emphasis?.process(opener.position);
		let definition: T | undefined;
		if (footnotes) {
			const labelEnd = boundaries.length > opener.boundaryStart
				? boundaries[opener.boundaryStart]
				: index - 1;
			const label = decodeReferenceLabel(text, opener.caret, labelEnd);
			definition = label === undefined ? undefined : footnotes.find(label);
		}
		if (references) {
			references.length = opener.referenceStart;
			if (definition !== undefined) {
				references.push(definition);
			}
		}
		if (definition !== undefined && footnotes!.emit) {
			spans.push({
				type: 'footnote',
				definition,
			});
		}
	};
	const addAutolink = (start: number, end: number) => {
		if (!links) {
			return;
		}
		if (spans.length > 0) {
			spans.push({
				type: 'autolink',
				start,
				end,
			});
		} else if (!links.inData()) {
			links.autolink(text, start, end);
		}
	};
	const flushSpans = () => {
		if (spans.length === 0) {
			return;
		}
		const parents: string[] = [];
		// The renderer omits strong nodes whose immediate parent is also strong.
		// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/html.c#L366-L374
		const emitElement = (name: 'em' | 'strong' | 'del', open: boolean) => {
			if (!open) {
				parents.pop();
			}
			if (name !== 'strong' || parents.at(-1) !== 'strong') {
				element!(name, open);
			}
			if (open) {
				parents.push(name);
			}
		};
		for (const span of spans) {
			switch (span.type) {
				case 'link': {
					if (span.state === 'open' && span.image) {
						links!.image(span.target!);
					} else if (span.state === 'open') {
						parents.push('a');
						links!.open(span.target!);
					} else if (span.state === 'close') {
						parents.pop();
						links!.close();
					}
					break;
				}
				case 'delimiter': {
					const { opens, closes } = span.delimiter;
					for (const name of closes) {
						emitElement(name, false);
					}
					for (let cursor = opens.length - 1; cursor >= 0; cursor -= 1) {
						emitElement(opens[cursor], true);
					}
					break;
				}
				case 'footnote': {
					footnotes!.emit!(span.definition as T);
					break;
				}
				case 'autolink': {
					links!.autolink(text, span.start, span.end);
					break;
				}
				default: {
					emit(span.start, span.end);
				}
			}
		}
		spans.length = 0;
	};
	// `handle_close_bracket`: https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1199-L1228
	const matchReference = (opener: (typeof brackets)[number], start: number) => {
		const labelEnd = text.charCodeAt(start) === 91 ? scanLabel(text, start, true) : -1;
		let label = labelEnd === -1 ? '' : text.slice(start + 1, labelEnd - 1);
		let labelStart = 0;
		while (labelStart < label.length && isCmarkSpace(label.charCodeAt(labelStart))) {
			labelStart += 1;
		}
		const empty = labelStart === label.length;
		if ((labelEnd === -1 || empty) && !opener.bracketAfter) {
			label = text.slice(opener.position, start - 1);
		}
		if (labelEnd === -1 && opener.bracketAfter) {
			return -1;
		}
		const definition = lookupLabel(label);
		if (!definition) {
			return -1;
		}
		linkTarget = definition;
		return labelEnd === -1 ? start : labelEnd;
	};

	let index = 0;
	while (index < text.length) {
		const code = text.charCodeAt(index);
		switch (code) {
			case 42: case 95: case 126: {
				if (!element) {
					index += 1;
					break;
				}
				emphasis ??= createEmphasis(text);
				const { end, delimiter } = emphasis.push(index);
				if (delimiter) {
					spans.push({
						type: 'delimiter',
						delimiter,
					});
				}
				index = end;
				break;
			}
			case 58:
			case 119: {
				const end = brackets.length === 0 ? matchBareAutolink(text, index) : -1;
				if (end === -1) {
					index += 1;
					break;
				}
				addAutolink(index, end);
				index = end;
				break;
			}
			case 33: {
				if (text.charCodeAt(index + 1) === 91 && text.charCodeAt(index + 2) !== 94) {
					pushBracket(true);
					index += 2;
				} else {
					index += 1;
				}
				break;
			}
			case 91: {
				pushBracket(false);
				index += 1;
				break;
			}
			case 93: {
				const opener = brackets.pop();
				index += 1;
				if (!opener) {
					break;
				}
				if (opener.caret !== -1) {
					carets -= 1;
				}
				if (opener.link) {
					linkSpans -= 1;
				}
				let end = -1;
				let footnote = false;
				if (opener.image || !noLinkOpeners) {
					end = matchLinkTail(index);
					if (end === -1) {
						end = matchReference(opener, index);
					} else {
						linkTarget = undefined;
					}
					// `noMatch`: brackets whose text starts with `^` and goes on
					// make a footnote reference, defined or not.
					// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1236-L1314
					footnote = end === -1 && opener.caret !== -1 && opener.caret < index - 1;
				}
				if (end !== -1) {
					index = end;
					emphasis?.process(opener.position);
					// Without a span, the opening markup was written in the data state.
					if (opener.link) {
						opener.link.state = 'open';
						opener.link.target = linkTarget ?? inlineTarget();
					}
					if (opener.image) {
						// The description renders as the `alt` text, without markup.
						spans.length = opener.spanStart + (opener.link ? 1 : 0);
					} else {
						noLinkOpeners = true;
						// With no spans held, the closing tag meets the current state.
						// In the data state it changes nothing.
						if (links && (spans.length > 0 || !links.inData())) {
							spans.push({
								type: 'link',
								image: false,
								state: 'close',
								target: undefined,
							});
						}
					}
				} else if (footnote) {
					addReference(opener);
				}
				// A completed link, image, or reference ends an outer label.
				if ((end !== -1 || footnote) && carets > 0 && tracksLabels) {
					// Brackets close innermost first, so `boundaries` always holds
					// at least the `boundaryStart` of every open opener.
					boundaries.length = opener.boundaryStart;
					boundaries.push(opener.position - (opener.image ? 2 : 1));
				}
				if (opener.image) {
					images -= 1;
				}
				if (
					images === 0 && carets === 0 && linkSpans === 0 && !emphasis
					&& (!element || brackets.length === 0)
				) {
					flushSpans();
				}
				break;
			}
			case 92: {
				const next = text.charCodeAt(index + 1);
				if (next === 10 && carets > 0) {
					// A hard line break.
					addBoundary(index);
				}
				index += isAsciiPunctuation(next) ? 2 : 1;

				break;
			}
			case 10: {
				if (carets > 0) {
					addBoundary(index);
				}
				index += 1;
				break;
			}
			case 96: {
				const end = skipBackticks(index);
				// A code span ends after a later run than the one at `index`.
				if (carets > 0 && end !== runStarts![currentRun] + runLengths[currentRun]) {
					addBoundary(index);
				}
				index = end;

				break;
			}
			case 60: {
				const autolinkEnd = matchAutolink(text, index);
				if (autolinkEnd !== -1) {
					if (carets > 0) {
						addBoundary(index);
					}
					addAutolink(index, autolinkEnd);
					index = autolinkEnd;
					break;
				}
				const end = matchRawHtml(index);
				if (end === -1) {
					index += 1;
				} else {
					if (carets > 0) {
						addBoundary(index);
					}
					if (
						images > 0 || carets > 0 || linkSpans > 0
						|| (element && (brackets.length > 0 || emphasis))
					) {
						spans.push({
							type: 'html',
							start: index,
							end,
						});
					} else {
						emit(index, end);
					}
					index = end;
				}

				break;
			}
			default: {
				index += 1;
			}
		}
	}
	emphasis?.process(0);
	flushSpans();
	if (references) {
		for (const definition of references) {
			footnotes!.count!(definition);
		}
	}
};
