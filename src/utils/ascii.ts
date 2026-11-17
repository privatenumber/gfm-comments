/** Whether the code unit is an uppercase ASCII letter. */
export const isAsciiUppercase = (code: number) => code >= 65 && code <= 90;

/** Lowercases an ASCII letter and leaves every other code unit alone. */
export const toAsciiLower = (code: number) => (isAsciiUppercase(code) ? code + 32 : code);

/** `spacechar` in cmark-gfm: space, tab, LF, VT, FF, and CR. */
export const isSpaceChar = (code: number) => code === 32 || (code >= 9 && code <= 13);

export const isAsciiLetter = (code: number) => (
	(code >= 65 && code <= 90) || (code >= 97 && code <= 122)
);

export const isAsciiDigit = (code: number) => code >= 48 && code <= 57;

export const isAsciiAlphanumeric = (code: number) => isAsciiLetter(code) || isAsciiDigit(code);

/** `cmark_ispunct`: ASCII punctuation. */
export const isAsciiPunctuation = (code: number) => (
	(code >= 33 && code <= 47)
	|| (code >= 58 && code <= 64)
	|| (code >= 91 && code <= 96)
	|| (code >= 123 && code <= 126)
);

/**
 * `cmark_isspace`: tab, line feed, carriage return, and space. Unlike the HTML
 * whitespace in `isSpaceChar`, it excludes `\v` and `\f`:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/cmark_ctype.c#L7-L11
 */
export const isCmarkSpace = (code: number) => (
	code === 32 || code === 9 || code === 10 || code === 13
);

/** Removes `cmark_isspace` characters from both ends, as `cmark_chunk_trim` does. */
export const trimCmarkSpace = (text: string) => {
	let start = 0;
	let end = text.length;
	while (start < end && isCmarkSpace(text.charCodeAt(start))) {
		start += 1;
	}
	while (end > start && isCmarkSpace(text.charCodeAt(end - 1))) {
		end -= 1;
	}
	return text.slice(start, end);
};
