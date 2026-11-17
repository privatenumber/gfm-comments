import { isHighSurrogate, isLowSurrogate } from './surrogate.ts';

/**
 * The UTF-8 length of the code unit at `index`. A surrogate pair is 4 bytes in
 * all. cmark-gfm reads NUL, and encoding reads a lone surrogate, as U+FFFD,
 * which is 3 bytes.
 */
export const utf8Length = (text: string, index: number) => {
	const code = text.charCodeAt(index);
	if (code === 0) {
		return 3;
	}
	if (code < 0x80) {
		return 1;
	}
	if (code < 0x8_00) {
		return 2;
	}
	if (
		(isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1)))
		|| (isLowSurrogate(code) && isHighSurrogate(text.charCodeAt(index - 1)))
	) {
		return 2;
	}
	return 3;
};
