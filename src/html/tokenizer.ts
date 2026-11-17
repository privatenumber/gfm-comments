import { isAsciiLetter, isSpaceChar, toAsciiLower } from '../utils/ascii.ts';
import { createForwardSearch } from '../utils/forward-search.ts';
import { isHighSurrogate, isLowSurrogate, isSurrogate } from '../utils/surrogate.ts';
import { createElementStack } from './elements.ts';

/**
 * The browser phase. The renderer copies raw HTML to its output, apart from the
 * tagfilter escapes below and NUL, which it writes as U+FFFD. The browser's
 * HTML tokenizer decides which of it is a comment:
 * https://html.spec.whatwg.org/multipage/parsing.html#tokenization
 *
 * The tokenizer reads raw HTML as a sequence of source segments, one per line
 * of an HTML block or of an inline raw HTML span. Between two segments the
 * browser sees a line feed, escaped text, markup that the renderer generates,
 * such as `</p>` or `<li>`, or nothing, as between two raw HTML spans that
 * touch. Thematic breaks, code blocks, and footnote markup provide generated
 * markup exactly, except for a named entity value in a fence language: it
 * keeps its first byte when that byte is ASCII and writes U+FFFD for the rest,
 * while a name the entity table does not hold stays as its source text.
 * Neither form can end the quoted attribute.
 * Other generated markup is approximated by `afterMarkup`, `open`, and `close`:
 * only an open comment, quoted attribute value, or CDATA carries past it.
 * Without markup, as between two HTML blocks, every state carries.
 *
 * Only the states that decide where a comment starts and ends are modeled.
 * Every comment the browser builds is reported, including the parse errors
 * that still produce one: `<!-->` and `<!--->` end at once, `--!>` ends a
 * comment as `-->` does, and a comment still open at the end of the document
 * runs to its end.
 */

const State = {
	Data: 0,
	Comment: 1,
	BogusComment: 2,
	TagName: 3,
	BeforeAttributeName: 4,
	AttributeName: 5,
	AfterAttributeName: 6,
	BeforeAttributeValue: 7,
	DoubleQuotedValue: 8,
	SingleQuotedValue: 9,
	UnquotedValue: 10,
	AfterQuotedValue: 11,
	Cdata: 12,
} as const;

// GitHub's tagfilter extension writes `<` as `&lt;` before these tag names, so
// the browser reads their contents as ordinary HTML:
// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/tagfilter.c
const filteredTagNames = ['title', 'textarea', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'script', 'plaintext'];

const isHtmlWhitespace = (code: number) => (
	code === 32 || code === 9 || code === 10 || code === 12 || code === 13
);

/**
 * An HTML comment that GitHub renders. Offsets are UTF-16 indexes into the
 * source string, as used by `String.prototype.slice()`.
 */
export type Comment = {

	/** Index of the opening `<!--`. */
	start: number;

	/**
	 * Index just past the closer. `source.slice(contentEnd, end)` is the closer:
	 * `-->`, `--!>`, `>` in `<!-->`, `->` in `<!--->`, or an empty string. An
	 * empty closer means that GitHub does not close the comment within this
	 * stretch of source: it runs to the end of the document or of a footnote
	 * definition, or up to a footnote definition that GitHub moves to the end
	 * of the page.
	 */
	end: number;

	/** Index of the first character after `<!--`. */
	contentStart: number;

	/** Index just past the comment's content, where its closer starts. */
	contentEnd: number;

	/**
	 * A prefix to write at the start of a following line so that the new line
	 * stays in the same containers, such as `> ` in a blockquote or spaces in a
	 * list item. `>Text <!-- a -->` gives `> `, and `1. <!-- a -->` gives three
	 * spaces. It is an editing aid, not a rendering fact: it is built from the
	 * comment's containers, not copied from the source line, and GitHub does
	 * not render it. It is an empty string outside containers.
	 */
	nextLinePrefix: string;

	/**
	 * Whether the comment is on an HTML block line whose first content, after
	 * spaces and tabs, is a comment. Every comment on that line shares the
	 * value, and a line that starts inside a multiline comment inherits it from
	 * that comment. It is false for inline HTML in a paragraph, heading, or
	 * cell.
	 */
	onCommentLine: boolean;
};

export type HtmlTokenizer = {

	/**
	 * Tokenizes the source from `start` to `end`, which follows a line feed.
	 * `afterMarkup` is true when markup that the renderer generates also comes
	 * before it. `inHtmlBlock` marks the lines of an HTML block, where a comment
	 * that begins its line starts the line.
	 */
	feed: (
		start: number,
		end: number,
		afterMarkup: boolean,
		nextLinePrefix: string,
		inHtmlBlock: boolean,
	) => void;

	/**
	 * Tokenizes markup that the renderer generates. In the data state, which
	 * is the usual case, only its element changes apply: each name in
	 * `elements` opens an element, and each `/name` closes one. Otherwise
	 * `render` supplies the exact markup.
	 */
	generated: (afterMarkup: boolean, elements: readonly string[], render: () => string) => void;

	/**
	 * Marks the start of output that is not the source text that follows the
	 * previous segment, such as a footnote definition, which the renderer
	 * moves to the end. Segments may then go back in the source. A comment that
	 * is still open has no source range, so it is reported as running to the
	 * end of the document.
	 */
	boundary: () => void;

	/** Reports a comment that is still open at the end of the document. */
	finish: () => void;
	wantsCode: () => boolean;

	/** Whether a comment is open, so later text can still end it. */
	inComment: () => boolean;
	open: (name: string) => void;
	close: (name: string) => void;
};

export const createHtmlTokenizer = (
	document: string,
	comments: Comment[],
	hasForeignContent: boolean,
): HtmlTokenizer => {
	const findTagOpen = createForwardSearch(document, '<');
	const findTagClose = createForwardSearch(document, '>');
	const findCommentClose = createForwardSearch(document, '-->');
	const findBangCommentClose = createForwardSearch(document, '--!>');
	const findDoubleQuote = createForwardSearch(document, '"');
	const findSingleQuote = createForwardSearch(document, '\'');
	const findCdataClose = createForwardSearch(document, ']]>');
	let source = document;
	let synthetic = false;
	// After a boundary, segments can go back in the source, so a search reads
	// only the current segment and keeps its result for that segment. Reads
	// in one segment move forward, so each character is read a bounded number
	// of times per needle.
	let unordered = false;
	let segment = 0;
	const segmentResults = new Map<string, [segment: number, from: number, found: number]>();
	const searchSegment = (needle: string, index: number) => {
		const cached = segmentResults.get(needle);
		if (cached?.[0] === segment) {
			const [, from, found] = cached;
			if (found === -1 ? from <= index : found >= index) {
				return found;
			}
		}
		const offset = source.slice(index, end).indexOf(needle);
		const found = offset === -1 ? -1 : index + offset;
		segmentResults.set(needle, [segment, index, found]);
		return found;
	};
	// Source searches keep monotonic positions; synthetic input uses separate searches.
	const search = (find: (index: number) => number, needle: string, index: number) => {
		if (synthetic) {
			return source.indexOf(needle, index);
		}
		if (unordered) {
			return searchSegment(needle, index);
		}
		return find(index);
	};
	const { elements, processElement } = createElementStack();

	let state: number = State.Data;
	let tagNameStart = 0;
	let isEndTag = false;
	let tagName = '';
	let selfClosing = false;
	let commentStart = -1;
	let commentNextLinePrefix = '';
	let commentOnCommentLine = false;
	// Whether the open comment continues past a boundary.
	let commentCrossed = false;

	// The end of the segment being read. Positions from it on read as the line
	// feed that follows the segment.
	let end = 0;
	const peek = (index: number) => (index < end ? source.charCodeAt(index) : 10);

	const isFilteredTag = (index: number) => {
		let nameStart = index + 1;
		if (source.charCodeAt(nameStart) === 47) {
			nameStart += 1;
		}
		for (const name of filteredTagNames) {
			let matches = true;
			for (let offset = 0; offset < name.length; offset += 1) {
				if (toAsciiLower(peek(nameStart + offset)) !== name.charCodeAt(offset)) {
					matches = false;
					break;
				}
			}
			if (matches) {
				const after = peek(nameStart + name.length);
				return isSpaceChar(after)
					|| after === 62
					|| (after === 47 && peek(nameStart + name.length + 1) === 62);
			}
		}
		return false;
	};

	const endTagName = (nameEnd: number) => {
		if (!hasForeignContent) {
			return;
		}
		tagName = '';
		for (let index = tagNameStart; index < nameEnd; index += 1) {
			const code = source.charCodeAt(index);
			if (code === 0 || isSurrogate(code)) {
				const next = source.charCodeAt(index + 1);
				if (isHighSurrogate(code) && index + 1 < nameEnd && isLowSurrogate(next)) {
					tagName += source[index] + source[index + 1];
					index += 1;
				} else {
					tagName += '\uFFFD';
				}
			} else {
				tagName += String.fromCharCode(toAsciiLower(code));
			}
		}
	};

	const emitTag = () => {
		// Without SVG or MathML, no element can be foreign, so elements are not
		// tracked.
		if (hasForeignContent) {
			processElement(tagName, isEndTag, selfClosing);
		}
		state = State.Data;
	};

	/** Reads data from `index` and returns where reading continues. */
	const readData = (index: number, nextLinePrefix: string, onCommentLine: boolean) => {
		const open = search(findTagOpen, '<', index);
		if (open === -1 || open >= end) {
			return end;
		}

		const next = peek(open + 1);
		if (next === 33) {
			if (elements.at(-1)?.foreign && open + 9 <= end && source.startsWith('<![CDATA[', open)) {
				state = State.Cdata;
				return open + 9;
			}
			if (peek(open + 2) !== 45 || peek(open + 3) !== 45) {
				// A doctype, CDATA section, or bogus comment. All end at `>`.
				state = State.BogusComment;
				return open + 2;
			}
			// `<!-->` and `<!--->` are empty comments
			const emptyEnd = peek(open + 4) === 62
				? open + 5
				: (peek(open + 4) === 45 && peek(open + 5) === 62 ? open + 6 : -1);
			if (emptyEnd !== -1) {
				if (!synthetic) {
					comments.push({
						start: open,
						end: emptyEnd,
						contentStart: open + 4,
						contentEnd: open + 4,
						nextLinePrefix,
						onCommentLine,
					});
				}
				return emptyEnd;
			}
			state = State.Comment;
			commentStart = synthetic ? -1 : open;
			commentCrossed = false;
			commentNextLinePrefix = nextLinePrefix;
			commentOnCommentLine = onCommentLine;
			return open + 4;
		}
		if (next === 63) {
			state = State.BogusComment;
			return open + 2;
		}

		const closing = next === 47;
		const nameStart = closing ? open + 2 : open + 1;
		const first = peek(nameStart);
		if (!isAsciiLetter(first)) {
			if (closing) {
				// `</>` is dropped, and `</` before anything else starts a bogus comment.
				if (first === 62) {
					return open + 3;
				}
				state = State.BogusComment;
				return open + 2;
			}
			return open + 1;
		}
		if (!synthetic && isFilteredTag(open)) {
			return open + 1;
		}
		state = State.TagName;
		isEndTag = closing;
		selfClosing = false;
		tagNameStart = nameStart;
		return nameStart + 1;
	};

	/** Reads one character of a tag at `index`. */
	const readTag = (index: number) => {
		const code = source.charCodeAt(index);
		switch (state) {
			case State.TagName: {
				if (isHtmlWhitespace(code) || code === 47) {
					endTagName(index);
					selfClosing = code === 47;
					state = State.BeforeAttributeName;
				} else if (code === 62) {
					endTagName(index);
					emitTag();
				}
				return index + 1;
			}
			case State.BeforeAttributeName: {
				if (code === 62) {
					emitTag();
				} else if (code === 47) {
					selfClosing = true;
				} else if (isHtmlWhitespace(code)) {
					selfClosing = false;
				} else {
					selfClosing = false;
					state = State.AttributeName;
				}
				return index + 1;
			}
			// Whitespace after a name waits for `=` or the next attribute's name.
			case State.AttributeName:
			case State.AfterAttributeName: {
				switch (code) {
					case 47: {
						selfClosing = true;
						state = State.BeforeAttributeName;
						break;
					}
					case 61: {
						state = State.BeforeAttributeValue;
						break;
					}
					case 62: {
						emitTag();
						break;
					}
					default: {
						state = isHtmlWhitespace(code) ? State.AfterAttributeName : State.AttributeName;
					}
				}
				return index + 1;
			}
			case State.BeforeAttributeValue: {
				switch (code) {
					case 34: {
						state = State.DoubleQuotedValue;
						break;
					}
					case 39: {
						state = State.SingleQuotedValue;
						break;
					}
					case 62: {
						emitTag();
						break;
					}
					default: {
						if (!isHtmlWhitespace(code)) {
							state = State.UnquotedValue;
						}
					}
				}
				return index + 1;
			}
			case State.UnquotedValue: {
				if (isHtmlWhitespace(code)) {
					state = State.BeforeAttributeName;
				} else if (code === 62) {
					emitTag();
				}
				return index + 1;
			}
			default: {
				// After a quoted value, anything but `>` continues the attributes.
				if (code === 62) {
					emitTag();
				} else if (isHtmlWhitespace(code) || code === 47) {
					selfClosing = code === 47;
					state = State.BeforeAttributeName;
				} else {
					selfClosing = false;
					state = State.AttributeName;
				}
				return index + 1;
			}
		}
	};

	/** Reads from `index` in the current state and returns where reading continues. */
	const read = (index: number, nextLinePrefix: string, onCommentLine: boolean) => {
		switch (state) {
			case State.Data: {
				return readData(index, nextLinePrefix, onCommentLine);
			}
			case State.Comment: {
				const close = search(findCommentClose, '-->', index);
				const bangClose = search(findBangCommentClose, '--!>', index);
				const closes = close !== -1 && close + 3 <= end;
				const bangCloses = bangClose !== -1 && bangClose + 4 <= end;
				if (!closes && !bangCloses) {
					return end;
				}
				state = State.Data;
				const dashCloses = closes && (!bangCloses || close < bangClose);
				const contentEnd = dashCloses ? close : bangClose;
				const commentEnd = contentEnd + (dashCloses ? 3 : 4);
				// Only comments with both endpoints in the document have source
				// ranges. A comment that crossed a boundary has no single range.
				if (!synthetic && commentStart !== -1) {
					comments.push({
						start: commentStart,
						end: commentCrossed ? document.length : commentEnd,
						contentStart: commentStart + 4,
						contentEnd: commentCrossed ? document.length : contentEnd,
						nextLinePrefix: commentNextLinePrefix,
						onCommentLine: commentOnCommentLine,
					});
				}
				return commentEnd;
			}
			case State.BogusComment: {
				const close = search(findTagClose, '>', index);
				if (close === -1 || close >= end) {
					return end;
				}
				state = State.Data;
				return close + 1;
			}
			case State.DoubleQuotedValue:
			case State.SingleQuotedValue: {
				const quote = state === State.DoubleQuotedValue
					? search(findDoubleQuote, '"', index)
					: search(findSingleQuote, '\'', index);
				if (quote === -1 || quote >= end) {
					return end;
				}
				state = State.AfterQuotedValue;
				return quote + 1;
			}
			case State.Cdata: {
				const close = search(findCdataClose, ']]>', index);
				if (close === -1 || close + 3 > end) {
					return end;
				}
				state = State.Data;
				return close + 3;
			}
			default: {
				return readTag(index);
			}
		}
	};

	/** Moves past the line feed or generated markup that precedes a segment. */
	const separate = (afterMarkup: boolean) => {
		selfClosing = false;
		// A line feed ends a tag name, attribute name, or unquoted value.
		switch (state) {
			case State.TagName: {
				endTagName(end);
				state = State.BeforeAttributeName;
				break;
			}
			case State.AttributeName: {
				state = State.AfterAttributeName;
				break;
			}
			case State.UnquotedValue:
			case State.AfterQuotedValue: {
				state = State.BeforeAttributeName;
				break;
			}
			default: {
				// Other states read a line feed as content or as whitespace.
				break;
			}
		}

		// Generated markup ends with `>`, which ends any tag or bogus comment.
		if (
			afterMarkup
			&& state !== State.Data
			&& state !== State.Comment
			&& state !== State.DoubleQuotedValue
			&& state !== State.SingleQuotedValue
			&& state !== State.Cdata
		) {
			if (state === State.BogusComment) {
				state = State.Data;
			} else {
				emitTag();
			}
			return true;
		}
		return false;
	};

	return {
		wantsCode: () => state !== State.Data,
		inComment: () => state === State.Comment,
		finish: () => {
			if (state === State.Comment && commentStart !== -1) {
				comments.push({
					start: commentStart,
					end: document.length,
					contentStart: commentStart + 4,
					contentEnd: document.length,
					nextLinePrefix: commentNextLinePrefix,
					onCommentLine: commentOnCommentLine,
				});
			}
		},
		boundary: () => {
			unordered = true;
			commentCrossed ||= state === State.Comment && commentStart !== -1;
		},
		generated: (afterMarkup, names, render) => {
			separate(afterMarkup);
			if (state === State.Data) {
				if (hasForeignContent) {
					for (const name of names) {
						if (name.charCodeAt(0) === 47) {
							processElement(name.slice(1), true);
						} else {
							processElement(name, false);
						}
					}
				}
				return;
			}
			source = render();
			synthetic = true;
			end = source.length;
			let index = 0;
			while (index < end) {
				index = read(index, '', false);
			}
		},
		open: (name) => {
			const consumed = separate(true);
			if (hasForeignContent && !consumed && state === State.Data) {
				processElement(name, false);
			}
		},
		close: (name) => {
			const consumed = separate(true);
			if (hasForeignContent && !consumed && state === State.Data) {
				processElement(name, true);
			}
		},
		feed: (start, segmentEnd, afterMarkup, nextLinePrefix, inHtmlBlock) => {
			separate(afterMarkup);
			source = document;
			synthetic = false;
			end = segmentEnd;
			segment += 1;

			let onCommentLine = false;
			if (inHtmlBlock) {
				let first = start;
				while (first < end && (source.charCodeAt(first) === 32 || source.charCodeAt(first) === 9)) {
					first += 1;
				}
				// A `<!--` opens a comment only in the data state, not inside a tag.
				onCommentLine = (state === State.Data && source.startsWith('<!--', first))
					|| (state === State.Comment && commentOnCommentLine);
			}

			let index = start;
			while (index < end) {
				index = read(index, nextLinePrefix, onCommentLine);
			}
		},
	};
};
