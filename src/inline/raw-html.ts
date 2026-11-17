import { scanHtmlTag } from '../html/tag.ts';
import { isAsciiLetter, isAsciiUppercase, isSpaceChar } from '../utils/ascii.ts';

/**
 * Skips a construct that ends at the first run of `char` whose length leaves
 * two of them before `>`. This is how the `htmlcomment` and `cdata` patterns
 * close: a run of 3 or 4 dashes before `>` is still content, and a run of 5
 * ends the comment. Returns the index after the `>`, or -1 at the end of input.
 */
const skipToRunClose = (text: string, index: number, char: number) => {
	while (index < text.length) {
		if (text.charCodeAt(index) !== char) {
			index += 1;
		} else if (text.charCodeAt(index + 1) !== char) {
			index += 2;
		} else if (text.charCodeAt(index + 2) === 62) {
			return index + 3;
		} else {
			index += 3;
		}
	}
	return -1;
};

/**
 * Skips a processing instruction after its `<?`. Each `?` pairs with the
 * character after it, so it ends at the first unpaired `?` before `>`.
 */
const skipProcessingInstruction = (text: string, index: number) => {
	while (index < text.length) {
		if (text.charCodeAt(index) !== 63) {
			index += 1;
		} else if (text.charCodeAt(index + 1) === 62) {
			return index + 2;
		} else {
			index += 2;
		}
	}
	return -1;
};

/**
 * Returns a matcher for raw HTML in `text`, as `handle_pointy_brace` reads it
 * after the autolink patterns fail. One matcher serves one inline text, since
 * it remembers which constructs failed to close.
 */
export const createRawHtmlMatcher = (text: string) => {
	// Once a kind of construct fails to close, cmark-gfm stops matching that
	// kind for the rest of the text. An unclosed comment disables every `<!`
	// construct, including empty comments.
	let skipBang = false;
	let skipCdata = false;
	let skipDeclaration = false;
	let skipProcessing = false;

	/** Returns the end of the raw HTML at the `<` at `index`, or -1. */
	const matchRawHtml = (index: number) => {
		if (index + 3 > text.length) {
			return -1;
		}

		const next = text.charCodeAt(index + 1);
		if (next === 33) {
			if (skipBang) {
				return -1;
			}
			const after = text.charCodeAt(index + 2);
			if (after === 45 && text.charCodeAt(index + 3) === 45) {
				if (text.charCodeAt(index + 4) === 62) {
					return index + 5;
				}
				if (text.charCodeAt(index + 4) === 45 && text.charCodeAt(index + 5) === 62) {
					return index + 6;
				}
				const end = skipToRunClose(text, index + 4, 45);
				skipBang = end === -1;
				return end;
			}
			if (after === 91) {
				if (skipCdata || !text.startsWith('CDATA[', index + 3)) {
					return -1;
				}
				const end = skipToRunClose(text, index + 9, 93);
				skipCdata = end === -1;
				return end;
			}
			if (skipDeclaration || !isAsciiUppercase(after)) {
				return -1;
			}
			let cursor = index + 3;
			while (isAsciiUppercase(text.charCodeAt(cursor))) {
				cursor += 1;
			}
			if (cursor >= text.length || !isSpaceChar(text.charCodeAt(cursor))) {
				return -1;
			}
			const close = text.indexOf('>', cursor);
			skipDeclaration = close === -1;
			return close === -1 ? -1 : close + 1;
		}
		if (next === 63) {
			if (skipProcessing) {
				return -1;
			}
			const end = skipProcessingInstruction(text, index + 2);
			skipProcessing = end === -1;
			return end;
		}
		return next === 47 || isAsciiLetter(next) ? scanHtmlTag(text, index, text.length) : -1;
	};

	return matchRawHtml;
};
