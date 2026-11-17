import { countDefinitionLines } from '../references/definition.ts';
import { isCmarkSpace, isSpaceChar } from '../utils/ascii.ts';
import { createForwardSearch } from '../utils/forward-search.ts';
import {
	parseListMarker,
	scanAtxHeadingStart,
	scanCloseFence,
	scanFootnoteDefinition,
	scanOpenFence,
	scanSetextHeadingLine,
	scanThematicBreak,
} from './block-starts.ts';
import { closesHtmlBlock, scanHtmlBlockStart } from './html-block.ts';
import { charAt, isSpaceOrTab, lineFeed } from './line.ts';
import { readTableRow, scanTableStart } from './table.ts';

/**
 * The block phase: a port of the block parser in GitHub's renderer, cmark-gfm
 * 0.29.0.gfm.13, with its table extension. It builds no tree. It tracks the
 * open containers and the open leaf block, as `check_open_blocks`,
 * `open_new_blocks`, and `add_text_to_container` do, and reports the text of
 * each leaf block that can hold raw HTML:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/blocks.c#L1044-L1518
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/table.c#L189-L522
 *
 * Positions are source offsets. Lines end at LF, CR, or CRLF, and the line
 * ending reads as LF.
 *
 * A footnote definition is a container, but the renderer moves it to the end
 * of the document, so its content is a separate stream of output. The phase
 * reports where each definition starts and ends; the receiver keeps its
 * events apart. Each stream has its own `markup` flag.
 */

export type ContainerName = 'blockquote' | 'li' | 'ul' | 'ol' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'table' | 'thead' | 'tbody' | 'tr' | 'th' | 'td';

export type BlockHandlers = {

	/**
	 * Receives the text of a paragraph, heading, or table cell when the block
	 * ends, as `[start, end]` pairs, one per line.
	 */
	text: (segments: number[], nextLinePrefix: string, unescapePipes: boolean, type: 'paragraph' | 'heading' | 'cell') => void;
	open?: ((type: ContainerName) => void) | undefined;
	close?: ((type: ContainerName) => void) | undefined;

	/**
	 * Receives the opening tag of a table cell whose column has an alignment,
	 * such as `<td align="left">`, in place of `open`. Its quotes matter only
	 * outside the data state, so it is called only when `wantsCode` is true.
	 */
	alignedCell?: ((type: 'th' | 'td', align: TableAlignment) => void) | undefined;

	/**
	 * Receives each line of an HTML block as it is read. `afterMarkup` is true
	 * when the renderer writes markup of its own, such as `<p>` or `</li>`,
	 * between the previous HTML block line and this one.
	 */
	html: (start: number, end: number, afterMarkup: boolean, nextLinePrefix: string) => void;

	/**
	 * Receives each thematic break, and each code block when it ends.
	 * `afterMarkup` is as for `html`. The receiver handles the block's own
	 * output, so the next HTML block line follows no other markup.
	 */
	generated: (block: GeneratedBlock, afterMarkup: boolean) => void;

	/** Whether a code block that opens now needs its lines kept. */
	wantsCode: () => boolean;

	definition?: (label: string, destination: string, title: string) => void;

	/**
	 * Receives the raw label of each footnote definition when it opens, and
	 * the position of its `[^`. The events until the matching `footnoteEnd`
	 * are the definition's content.
	 */
	footnoteStart?: ((label: string, start: number) => void) | undefined;

	/**
	 * Receives the end of the innermost open footnote definition: whether its
	 * last child is a paragraph, which holds the renderer's backlink, whether
	 * the renderer wrote markup after its last HTML block line, and the start
	 * of the first line after it, or the end of the source.
	 */
	footnoteEnd?: ((lastIsParagraph: boolean, markup: boolean, end: number) => void) | undefined;
};

export type TableAlignment = 'left' | 'center' | 'right';

type Alignments = {
	columns: (TableAlignment | undefined)[];

	// For each column, the first aligned column from it on, or -1.
	nextAligned: number[];
};

export type GeneratedBlock =
	| { type: 'thematicBreak' }
	| {
		type: 'code';
		infoStart: number;
		infoEnd: number;
		// Each line is a source start; partial tabs are [line index, spaces] pairs.
		lines: number[];
		tabSpaces: number[];
		indented: boolean;
		lastNonblank: number;
	};

type Container =
	| { type: 'blockquote' }
	| {
		type: 'list';
		marker: number;
	}
	| {
		type: 'listItem';
		// The column where the item's content starts, relative to its parent.
		indent: number;
		hasChild: boolean;
	}
	| {
		type: 'footnote';
		// The enclosing stream's `markup`, restored when the definition closes.
		savedMarkup: boolean;
		lastIsParagraph: boolean;
	};

const containerName = (container: Exclude<Container, { type: 'footnote' }>) => {
	if (container.type === 'list') {
		return container.marker === 46 || container.marker === 41 ? 'ol' : 'ul';
	}
	return container.type === 'listItem' ? 'li' : 'blockquote';
};

type Leaf =
	| {
		type: 'paragraph' | 'heading';
		headingLevel?: number;
		segments: number[];
		nextLinePrefix: string;
		// Set when the paragraph failed to become a table header.
		tableVisited: boolean;
	}
	| {
		type: 'fence';
		char: number;
		length: number;
		offset: number;
		code: Extract<GeneratedBlock, { type: 'code' }>;
	}
	| {
		type: 'indentedCode';
		code: Extract<GeneratedBlock, { type: 'code' }>;
	}
	| {
		type: 'html';
		kind: number;
		nextLinePrefix: string;
	}
	| {
		type: 'table';
		alignments: Alignments;
		nextLinePrefix: string;
		bodyOpen: boolean;
	};

type TextLeaf = Extract<Leaf, { type: 'paragraph' | 'heading' }>;

/**
 * What a line's content was last attached to: an open container, the open
 * leaf, or a block that takes no text, such as a table row or a thematic break.
 */
type Target = 'container' | Leaf['type'] | 'row' | 'thematicBreak';

const tabStop = 4;
const codeIndent = 4;
const maxListDepth = 100;

const trimTableText = (source: string, segments: number[]) => {
	let start = segments[0];
	let end = segments.at(-1)!;
	while (
		start < segments[1] && (source.charCodeAt(start) === 32 || source.charCodeAt(start) === 9)
	) {
		start += 1;
	}
	while (
		end > segments.at(-2)!
		&& (source.charCodeAt(end - 1) === 32 || source.charCodeAt(end - 1) === 9)
	) {
		end -= 1;
	}
	segments[0] = start;
	segments[segments.length - 1] = end;
	return segments;
};

/**
 * The block phase reads `source` one line at a time. When `stop` is given,
 * `stop.after` is the last position where a comment can start and
 * `stop.canStop` reports whether nothing pending can change one. The phase
 * stops after the first line that starts past `stop.after`, once no text leaf
 * that began at or before `stop.after` is open and `stop.canStop()` returns
 * true. A stop skips the rest of the source.
 */
export const lexBlocks = (
	source: string,
	handlers: BlockHandlers,
	stop?: {
		after: number;
		canStop: () => boolean;
	},
) => {
	const stopAfter = stop?.after ?? Number.POSITIVE_INFINITY;
	const canStop = stop?.canStop;
	const containers: Container[] = [];
	// The indices in `containers` of the open blockquotes and footnote
	// definitions, so a blank line can skip the containers between them.
	const blockquotes: number[] = [];
	const footnotes: number[] = [];
	let leaf: Leaf | undefined;
	let retainCodeLines = true;
	// Whether the renderer has written markup since the last HTML block line.
	// Opening or closing any block other than an HTML block writes markup.
	let markup = false;

	// The line being read, as cmark-gfm's parser fields. Every position from
	// `lineEnd` on reads as the line feed that ends the line.
	let lineEnd = 0;
	let offset = 0;
	let column = 0;
	let firstNonspace = 0;
	let firstNonspaceColumn = 0;
	let indent = 0;
	let blank = false;
	let partiallyConsumedTab = false;

	// The line state shared by the loop and the hoisted line closures below.
	// processLine reads it for the current line, so the closures are created
	// once instead of three times per line.
	let lineStart = 0;
	let matched = 0;
	let leafMatched = false;
	let rowCells: number[] | undefined;
	let allMatched = false;
	let unmatchedClosed = false;
	let target: Target = 'container';
	let opened = false;
	let lazyAllowed = false;

	const peek = (index: number) => charAt(source, index, lineEnd);

	const findFirstNonspace = () => {
		let charsToTab = tabStop - (column % tabStop);
		if (firstNonspace <= offset) {
			firstNonspace = offset;
			firstNonspaceColumn = column;
			for (;;) {
				const code = peek(firstNonspace);
				if (code === 32) {
					firstNonspace += 1;
					firstNonspaceColumn += 1;
					charsToTab -= 1;
					if (charsToTab === 0) {
						charsToTab = tabStop;
					}
				} else if (code === 9) {
					firstNonspace += 1;
					firstNonspaceColumn += charsToTab;
					charsToTab = tabStop;
				} else {
					break;
				}
			}
		}
		indent = firstNonspaceColumn - column;
		blank = firstNonspace >= lineEnd;
	};

	/**
	 * Advances by `count` columns, or by `count` characters when `columns` is
	 * false. A tab advanced over partly leaves `offset` on it.
	 */
	const advance = (count: number, columns: boolean) => {
		while (count > 0 && offset <= lineEnd) {
			if (peek(offset) === 9) {
				const charsToTab = tabStop - (column % tabStop);
				if (columns) {
					partiallyConsumedTab = charsToTab > count;
					const advanced = Math.min(count, charsToTab);
					column += advanced;
					offset += partiallyConsumedTab ? 0 : 1;
					count -= advanced;
				} else {
					partiallyConsumedTab = false;
					column += charsToTab;
					offset += 1;
					count -= 1;
				}
			} else {
				partiallyConsumedTab = false;
				offset += 1;
				column += 1;
				count -= 1;
			}
		}
	};

	const nextLinePrefix = () => {
		let prefix = '';
		for (const container of containers) {
			switch (container.type) {
				case 'blockquote': {
					prefix += '> ';
					break;
				}
				case 'listItem': {
					prefix += ' '.repeat(container.indent);
					break;
				}
				case 'footnote': {
					prefix += '    ';
					break;
				}
				// A list adds no prefix; its items do.
				default:
			}
		}
		return prefix;
	};

	/**
	 * Closes the innermost container at `end`, the start of the line that
	 * does not continue it. A footnote definition writes nothing to the
	 * enclosing stream, so that stream's `markup` returns. Any other container
	 * that closes is the last child of its parent so far.
	 */
	const popContainer = (end: number) => {
		const container = containers.pop()!;
		if (container.type === 'blockquote') {
			blockquotes.pop();
		}
		if (container.type === 'footnote') {
			footnotes.pop();
			handlers.footnoteEnd?.(container.lastIsParagraph, markup, end);
			markup = container.savedMarkup;
		} else {
			handlers.close?.(containerName(container));
			markup = true;
			const parent = containers.at(-1);
			if (parent?.type === 'footnote') {
				parent.lastIsParagraph = false;
			}
		}
	};

	const findLabelEnd = createForwardSearch(source, ']:');

	/**
	 * `resolve_reference_link_definitions`: drops the lines of the link
	 * reference definitions that start a paragraph. Returns whether text remains.
	 */
	const resolveDefinitions = (segments: number[]) => {
		if (source.charCodeAt(segments[0]) !== 91) {
			return true;
		}
		// A label and its colon share a line, so a paragraph without `]:` holds
		// no definition. Paragraphs close in source order, as the search needs.
		const labelEnd = findLabelEnd(segments[0]);
		if (labelEnd === -1 || labelEnd >= segments.at(-1)!) {
			return true;
		}
		let text = '';
		for (let index = 0; index < segments.length; index += 2) {
			text += `${source.slice(segments[index], segments[index + 1])}\n`;
		}
		segments.splice(0, countDefinitionLines(text, handlers.definition) * 2);
		return segments.length > 0;
	};

	const finalizeLeaf = () => {
		if (leaf?.type === 'fence' || leaf?.type === 'indentedCode') {
			if (leaf.code.indented) {
				leaf.code.lines.length = leaf.code.lastNonblank;
				while (
					leaf.code.tabSpaces.length && leaf.code.tabSpaces.at(-2)! >= leaf.code.lastNonblank
				) {
					leaf.code.tabSpaces.length -= 2;
				}
			}
			handlers.generated(leaf.code, markup);
			markup = false;
		}
		if (leaf?.type === 'table') {
			if (leaf.bodyOpen) {
				handlers.close?.('tbody');
			}
			handlers.close?.('table');
		}
		const keepsText = leaf?.type === 'heading'
			|| (leaf?.type === 'paragraph' && resolveDefinitions(leaf.segments));
		if (keepsText) {
			// A paragraph writes `<p>` only when text remains after its
			// definitions, so it sets `markup` here rather than when it opens.
			markup = true;
			const text = leaf as TextLeaf;
			if (text.type === 'heading') {
				handlers.open?.(`h${text.headingLevel}` as 'h1');
			}
			handlers.text(text.segments, text.nextLinePrefix, false, text.type);
			if (text.type === 'heading') {
				handlers.close?.(`h${text.headingLevel}` as 'h1');
			}
		}
		// A leaf's parent is the innermost container until the leaf closes, and
		// the leaf is its last child so far. A paragraph of only link reference
		// definitions leaves the tree, so the child before it stays last. The
		// renderer moves a nested definition out, so a container child is
		// recorded as it closes, in `popContainer`.
		const parent = containers.at(-1);
		if (parent?.type === 'footnote' && leaf && (keepsText || leaf.type !== 'paragraph')) {
			parent.lastIsParagraph = leaf.type === 'paragraph';
		}
		leaf = undefined;
	};

	const reportCells = (cells: number[], alignments: Alignments, prefix: string, type: 'th' | 'td') => {
		const { columns, nextAligned } = alignments;
		const end = Math.min(cells.length / 2, columns.length);
		for (let cell = 0; cell < end; cell += 1) {
			const align = columns[cell];
			if (align !== undefined && handlers.alignedCell && handlers.wantsCode()) {
				handlers.alignedCell(type, align);
			} else {
				handlers.open?.(type);
			}
			const segments = trimTableText(source, [cells[cell * 2], cells[(cell * 2) + 1]]);
			handlers.text(segments, prefix, true, 'cell');
			handlers.close?.(type);
		}

		// Generated empty cells follow a closed cell, so their adjacent open and
		// close cannot change the element stack. Only an alignment attribute's
		// quotes can change the tokenizer state: they close a double-quoted
		// value and end its tag. Any state that follows is one that the next
		// empty cells leave as it is, so only the first aligned one is reported,
		// which keeps a table with many columns and short rows linear.
		const aligned = end < columns.length ? nextAligned[end] : -1;
		if (aligned !== -1 && handlers.alignedCell && handlers.wantsCode()) {
			handlers.alignedCell(type, columns[aligned]!);
			handlers.close?.(type);
		}
	};

	// `try_opening_table_header` reads each delimiter cell, trimmed:
	// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/table.c#L382-L392
	const readAlignments = (delimiters: number[]): Alignments => {
		const columns: (TableAlignment | undefined)[] = [];
		for (let index = 0; index < delimiters.length; index += 2) {
			let end = delimiters[index + 1];
			while (end > delimiters[index] && isCmarkSpace(source.charCodeAt(end - 1))) {
				end -= 1;
			}
			const left = source.charCodeAt(delimiters[index]) === 58;
			const right = source.charCodeAt(end - 1) === 58;
			let align: TableAlignment | undefined;
			if (left) {
				align = right ? 'center' : 'left';
			} else if (right) {
				align = 'right';
			}
			columns.push(align);
		}
		// Filled from the end, so it starts at full length to stay packed.
		const nextAligned = columns.map(() => -1);
		let next = -1;
		for (let index = columns.length - 1; index >= 0; index -= 1) {
			if (columns[index] !== undefined) {
				next = index;
			}
			nextAligned[index] = next;
		}
		return {
			columns,
			nextAligned,
		};
	};

	/**
	 * `try_opening_table_header`: the paragraph's last line becomes the header
	 * row when this line is a delimiter row with the same number of cells.
	 */
	const openTableHeader = (paragraph: TextLeaf) => {
		if (paragraph.tableVisited || !scanTableStart(source, firstNonspace, lineEnd)) {
			return false;
		}
		const delimiters = readTableRow(source, firstNonspace, lineEnd);
		if (!delimiters) {
			return false;
		}
		const { segments } = paragraph;
		const header = readTableRow(source, segments.at(-2)!, segments.at(-1)!);
		if (!header || header.length !== delimiters.length) {
			paragraph.tableVisited = true;
			return false;
		}

		// cmark unescapes and trims the earlier lines as one paragraph:
		// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/table.c#L283-L295
		if (segments.length > 2) {
			const preceding = trimTableText(source, segments.slice(0, -2));
			handlers.text(preceding, paragraph.nextLinePrefix, true, 'paragraph');
		}
		markup = true;
		const alignments = readAlignments(delimiters);
		handlers.open?.('table');
		handlers.open?.('thead');
		handlers.open?.('tr');
		reportCells(header, alignments, paragraph.nextLinePrefix, 'th');
		handlers.close?.('tr');
		handlers.close?.('thead');
		leaf = {
			type: 'table',
			alignments,
			nextLinePrefix: paragraph.nextLinePrefix,
			bodyOpen: false,
		};
		advance(lineEnd - offset, false);
		return true;
	};

	// These line closures read the state that processLine resets for each line.
	// Creating them once avoids three function allocations per line.
	// Blocks that did not match close before any new block opens.
	const closeUnmatched = () => {
		if (unmatchedClosed) {
			return;
		}
		unmatchedClosed = true;
		if (!leafMatched) {
			finalizeLeaf();
		}
		while (containers.length > matched) {
			popContainer(lineStart);
		}
	};

	const addChild = (writesMarkup = true, listMarker?: number) => {
		closeUnmatched();
		if (target !== 'container') {
			finalizeLeaf();
		}
		let parent = containers.at(-1);
		if (parent?.type === 'list' && parent.marker !== listMarker) {
			popContainer(lineStart);
			parent = containers.at(-1);
		}
		if (parent?.type === 'listItem') {
			parent.hasChild = true;
		}
		opened = true;
		target = 'container';
		markup ||= writesMarkup;
	};

	// open_new_blocks: `openBlock` tries each block start in order, and
	// returns whether one matched. Only the first block on a line may be a
	// lazy paragraph continuation instead of indented code.
	const openBlock = (depth: number) => {
		findFirstNonspace();
		if (indent >= codeIndent) {
			if (lazyAllowed || blank) {
				return false;
			}
			advance(codeIndent, true);
			addChild(false);
			retainCodeLines = handlers.wantsCode();
			leaf = {
				type: 'indentedCode',
				code: {
					type: 'code',
					infoStart: 0,
					infoEnd: 0,
					lines: [],
					tabSpaces: [],
					indented: true,
					lastNonblank: 0,
				},
			};
			target = 'indentedCode';
			return true;
		}

		const char = peek(firstNonspace);
		if (char === 62) {
			advance(firstNonspace + 1 - offset, false);
			if (isSpaceOrTab(peek(offset))) {
				advance(1, true);
			}
			addChild();
			blockquotes.push(containers.length);
			containers.push({ type: 'blockquote' });
			handlers.open?.('blockquote');
			return true;
		}

		const headingLength = char === 35
			? scanAtxHeadingStart(source, firstNonspace, lineEnd)
			: 0;
		if (headingLength) {
			let headingLevel = 0;
			while (source.charCodeAt(firstNonspace + headingLevel) === 35) {
				headingLevel += 1;
			}
			advance(firstNonspace + headingLength - offset, false);
			addChild();
			leaf = {
				type: 'heading',
				headingLevel,
				segments: [],
				nextLinePrefix: nextLinePrefix(),
				tableVisited: false,
			};
			target = 'heading';
			return true;
		}

		const fenceLength = char === 96 || char === 126
			? scanOpenFence(source, firstNonspace, lineEnd)
			: 0;
		if (fenceLength) {
			const fenceOffset = firstNonspace - offset;
			addChild(false);
			retainCodeLines = handlers.wantsCode();
			leaf = {
				type: 'fence',
				char,
				// cmark-gfm stores at most 255, so any longer run closes it.
				length: Math.min(fenceLength, 255),
				offset: fenceOffset,
				code: {
					type: 'code',
					infoStart: firstNonspace + fenceLength,
					infoEnd: lineEnd,
					lines: [],
					tabSpaces: [],
					indented: false,
					lastNonblank: 0,
				},
			};
			advance(firstNonspace + fenceLength - offset, false);
			target = 'fence';
			return true;
		}

		const htmlKind = char === 60
			? scanHtmlBlockStart(source, firstNonspace, lineEnd, target === 'paragraph')
			: 0;
		if (htmlKind) {
			// Only the blocks that this closes write markup before it.
			addChild(false);
			leaf = {
				type: 'html',
				kind: htmlKind,
				nextLinePrefix: nextLinePrefix(),
			};
			target = 'html';
			return true;
		}

		if (
			target === 'paragraph'
			&& (char === 61 || char === 45)
			&& scanSetextHeadingLine(source, firstNonspace, lineEnd)
		) {
			// When only definitions precede it, the underline is paragraph text.
			const paragraph = leaf as TextLeaf;
			if (resolveDefinitions(paragraph.segments)) {
				paragraph.type = 'heading';
				paragraph.headingLevel = char === 61 ? 1 : 2;
				advance(lineEnd - offset, false);
				target = 'heading';
			}
			return true;
		}

		if (
			!(target === 'paragraph' && !allMatched)
			&& (char === 42 || char === 95 || char === 45)
			&& scanThematicBreak(source, firstNonspace, lineEnd)
		) {
			addChild(false);
			handlers.generated({ type: 'thematicBreak' }, markup);
			markup = false;
			// A thematic break is not a leaf, but it can be the last child.
			const parent = containers.at(-1);
			if (parent?.type === 'footnote') {
				parent.lastIsParagraph = false;
			}
			advance(lineEnd - offset, false);
			target = 'thematicBreak';
			return true;
		}

		const footnote = char === 91 && depth < maxListDepth
			? scanFootnoteDefinition(source, firstNonspace, lineEnd)
			: undefined;
		if (footnote) {
			const label = source.slice(firstNonspace + 2, footnote.labelEnd);
			advance(footnote.end - offset, false);
			addChild(false);
			// The definition's content is a separate stream, which the
			// renderer's exact opening markup starts.
			footnotes.push(containers.length);
			containers.push({
				type: 'footnote',
				savedMarkup: markup,
				lastIsParagraph: false,
			});
			markup = false;
			handlers.footnoteStart?.(label, firstNonspace);
			return true;
		}

		const markerLength = (
			char === 42
			|| char === 45
			|| char === 43
			|| (char >= 48 && char <= 57)
		) && depth < maxListDepth
			? parseListMarker(source, firstNonspace, lineEnd, target === 'paragraph')
			: 0;
		if (markerLength) {
			const markerOffset = indent;
			const marker = source.charCodeAt(firstNonspace + markerLength - 1);
			advance(firstNonspace + markerLength - offset, false);
			const savedOffset = offset;
			const savedColumn = column;
			const savedPartiallyConsumedTab: boolean = partiallyConsumedTab;
			while (column - savedColumn <= 5 && isSpaceOrTab(peek(offset))) {
				advance(1, true);
			}
			const spaces = column - savedColumn;
			let padding = markerLength + spaces;
			if (spaces >= 5 || spaces < 1 || offset >= lineEnd) {
				// One space is part of the marker; the rest is content.
				padding = markerLength + 1;
				offset = savedOffset;
				column = savedColumn;
				partiallyConsumedTab = savedPartiallyConsumedTab;
				if (spaces > 0) {
					advance(1, true);
				}
			}
			addChild(true, marker);
			if (containers.at(-1)?.type !== 'list') {
				containers.push({
					type: 'list',
					marker,
				});
				handlers.open?.(marker === 46 || marker === 41 ? 'ol' : 'ul');
			}
			containers.push({
				type: 'listItem',
				indent: markerOffset + padding,
				hasChild: false,
			});
			handlers.open?.('li');
			return true;
		}

		if (target === 'paragraph') {
			if (!openTableHeader(leaf as TextLeaf)) {
				return false;
			}
			target = 'table';
			return true;
		}

		if (target === 'table' && !blank) {
			if (!rowCells) {
				return false;
			}
			// A row is a child of the table, so the table stays open.
			closeUnmatched();
			opened = true;
			const table = leaf as Extract<Leaf, { type: 'table' }>;
			if (!table.bodyOpen) {
				table.bodyOpen = true;
				handlers.open?.('tbody');
			}
			handlers.open?.('tr');
			reportCells(rowCells, table.alignments, table.nextLinePrefix, 'td');
			handlers.close?.('tr');
			advance(lineEnd - offset, false);
			target = 'row';
			return true;
		}
		return false;
	};

	const processLine = (end: number) => {
		lineEnd = end;
		offset = lineStart;
		column = 0;
		firstNonspace = lineStart;
		firstNonspaceColumn = 0;
		indent = 0;
		blank = false;
		partiallyConsumedTab = false;
		// Reset the state read by the hoisted line closures.
		unmatchedClosed = false;
		// A leading byte order mark is skipped.
		if (lineStart === 0 && source.charCodeAt(0) === 0xFE_FF) {
			offset = 1;
		}

		// check_open_blocks: continue the open containers, outermost first.
		matched = 0;
		// The blockquotes and footnote definitions continued so far, which
		// index the next of each in `blockquotes` and `footnotes`.
		let blockquotesMatched = 0;
		let footnotesMatched = 0;
		for (; matched < containers.length; matched += 1) {
			findFirstNonspace();
			if (offset >= lineEnd) {
				// Nothing remains, so no container from here advances. A blockquote
				// stops the line, as does a footnote definition unless the line is
				// empty, and an item without a child, which only the innermost
				// container can be. Lists and the other items and definitions
				// continue, so the loop jumps to the next container that can stop.
				// This keeps nested containers over many blank lines linear.
				const last = containers.length - 1;
				matched = Math.min(
					blockquotes[blockquotesMatched] ?? last,
					lineStart === lineEnd ? last : (footnotes[footnotesMatched] ?? last),
					last,
				);
			}
			const container = containers[matched];
			if (container.type === 'footnote') {
				// `parse_footnote_definition_block_prefix` reads the whole line, so
				// only a line with nothing before its line ending is empty. cmark-gfm
				// replaces every line ending, a lone CR included, with `\n` first.
				// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/blocks.c#L1468-L1470
				if (indent >= codeIndent) {
					advance(codeIndent, true);
				} else if (lineStart !== lineEnd) {
					break;
				}
				footnotesMatched += 1;
				continue;
			}
			if (container.type === 'blockquote') {
				if (indent > 3 || peek(firstNonspace) !== 62) {
					break;
				}
				advance(indent + 1, true);
				if (isSpaceOrTab(peek(offset))) {
					advance(1, true);
				}
				blockquotesMatched += 1;
			} else if (container.type === 'list') {
				continue;
			} else if (indent >= container.indent) {
				advance(container.indent, true);
			} else if (blank && container.hasChild) {
				advance(firstNonspace - offset, false);
			} else {
				break;
			}
		}

		leafMatched = false;
		// The row of a table line, read once when the line matches the table.
		rowCells = undefined;
		if (leaf && matched === containers.length) {
			findFirstNonspace();
			switch (leaf.type) {
				case 'fence': {
					if (
						indent <= 3
						&& peek(firstNonspace) === leaf.char
						&& scanCloseFence(source, firstNonspace, lineEnd) >= leaf.length
					) {
						// The closing fence ends the line.
						finalizeLeaf();
						return;
					}
					for (let spaces = leaf.offset; spaces > 0 && isSpaceOrTab(peek(offset)); spaces -= 1) {
						advance(1, true);
					}
					leafMatched = true;
					break;
				}
				case 'indentedCode': {
					if (indent >= codeIndent) {
						advance(codeIndent, true);
						leafMatched = true;
					} else if (blank) {
						advance(firstNonspace - offset, false);
						leafMatched = true;
					}
					break;
				}
				case 'html': {
					leafMatched = leaf.kind <= 5 || !blank;
					break;
				}
				case 'paragraph': {
					leafMatched = !blank;
					break;
				}
				case 'table': {
					rowCells = readTableRow(source, firstNonspace, lineEnd);
					leafMatched = rowCells !== undefined;
					break;
				}
				default: {
					// A heading holds one line.
					break;
				}
			}
		}
		// A table's open row never matches, so its lines are never all matched.
		allMatched = matched === containers.length && (!leaf || (leafMatched && leaf.type !== 'table'));
		target = leafMatched ? leaf!.type : 'container';
		opened = false;
		lazyAllowed = leaf?.type === 'paragraph';

		for (let depth = 1; target !== 'fence' && target !== 'indentedCode' && target !== 'html'; depth += 1) {
			if (!openBlock(depth)) {
				break;
			}
			// `openBlock` changed `target`. A leaf that takes the line's text ends
			// the search.
			const openedTarget = target as Target;
			if (
				openedTarget === 'paragraph'
				|| openedTarget === 'heading'
				|| openedTarget === 'fence'
				|| openedTarget === 'indentedCode'
			) {
				break;
			}
			lazyAllowed = false;
		}

		// add_text_to_container
		findFirstNonspace();
		const contentStart = offset + (partiallyConsumedTab ? 1 : 0);

		// A lazy continuation line adds to the open paragraph without matching
		// the containers that hold it.
		if (!opened && leaf?.type === 'paragraph' && !leafMatched && !blank) {
			leaf.segments.push(contentStart, lineEnd);
			return;
		}

		closeUnmatched();
		switch (target) {
			case 'fence':
			case 'indentedCode': {
				const { code } = (leaf as Extract<Leaf, { type: 'fence' | 'indentedCode' }>);
				if (retainCodeLines && (target === 'indentedCode' || !opened)) {
					if (partiallyConsumedTab) {
						code.tabSpaces.push(code.lines.length, tabStop - (column % tabStop));
					}
					code.lines.push(contentStart);
					if (!blank) {
						code.lastNonblank = code.lines.length;
					}
				}
				return;
			}
			case 'html': {
				const html = leaf as Extract<Leaf, { type: 'html' }>;
				handlers.html(contentStart, lineEnd, markup, html.nextLinePrefix);
				markup = false;
				if (html.kind <= 5 && closesHtmlBlock(source, firstNonspace, lineEnd, html.kind)) {
					leaf = undefined;
				}
				return;
			}
			default: {
				break;
			}
		}
		if (blank) {
			return;
		}

		if (target === 'paragraph' || target === 'heading') {
			const text = leaf as TextLeaf;
			// Only an ATX heading line reaches here as a heading: a setext
			// underline is blank by now. It drops its closing `#` sequence.
			const textEnd = target === 'heading'
				? chopClosingSequence(source, firstNonspace, lineEnd)
				: lineEnd;
			text.segments.push(firstNonspace, textEnd);
			return;
		}

		addChild(false);
		leaf = {
			type: 'paragraph',
			segments: [firstNonspace, lineEnd],
			nextLinePrefix: nextLinePrefix(),
			tableVisited: false,
		};
	};

	// Lines end with LF, CR, or CRLF. Both searches only move forward, and the
	// one that was consumed is refreshed, so finding line ends stays linear.
	let lineFeedIndex = source.indexOf('\n');
	let carriageReturn = source.indexOf('\r');
	while (lineStart < source.length) {
		let end: number;
		let endingLength: number;
		if (lineFeedIndex === -1 && carriageReturn === -1) {
			// The last line has no line ending, and cmark-gfm reads no line
			// after a final one.
			end = source.length;
			endingLength = 0;
		} else if (carriageReturn !== -1 && (lineFeedIndex === -1 || carriageReturn < lineFeedIndex)) {
			end = carriageReturn;
			endingLength = source.charCodeAt(carriageReturn + 1) === lineFeed ? 2 : 1;
		} else {
			end = lineFeedIndex;
			endingLength = 1;
		}

		processLine(end);
		lineStart = end + endingLength;
		// No line from here can start a comment. A text leaf that began at or
		// before `stopAfter` may hold the last `<!--`, and only its end shows
		// whether the comment closes, so the phase stops only after that leaf.
		if (
			lineStart > stopAfter
			&& (
				leaf === undefined
				|| (leaf.type !== 'paragraph' && leaf.type !== 'heading')
				|| leaf.segments[0] > stopAfter
			)
			&& canStop?.()
		) {
			break;
		}

		if (lineFeedIndex !== -1 && lineFeedIndex < lineStart) {
			lineFeedIndex = source.indexOf('\n', lineStart);
		}
		if (carriageReturn !== -1 && carriageReturn < lineStart) {
			carriageReturn = source.indexOf('\r', lineStart);
		}
	}
	finalizeLeaf();
	while (containers.length > 0) {
		popContainer(source.length);
	}
	// Whether the main stream ends with markup after its last HTML block line.
	return markup;
};

/**
 * `chop_trailing_hashtags`: drops trailing whitespace, and a closing sequence of
 * `#` that follows a space or tab. Returns the new end.
 */
const chopClosingSequence = (source: string, start: number, end: number) => {
	while (end > start && isSpaceChar(source.charCodeAt(end - 1))) {
		end -= 1;
	}
	let hashes = end;
	while (hashes > start && source.charCodeAt(hashes - 1) === 35) {
		hashes -= 1;
	}
	if (hashes === start) {
		// Only the closing sequence remains; the opening one was already skipped.
		return start;
	}
	if (hashes === end || !isSpaceOrTab(source.charCodeAt(hashes - 1))) {
		return end;
	}
	while (hashes > start && isSpaceChar(source.charCodeAt(hashes - 1))) {
		hashes -= 1;
	}
	return hashes;
};
