import { scanDestination, scanTitle } from '../references/definition.ts';
import {
	isAsciiAlphanumeric,
	isAsciiLetter,
	isAsciiPunctuation,
	isCmarkSpace,
	isSpaceChar,
} from '../utils/ascii.ts';

/**
 * Indexes `manual_scan_link_url_2` boundaries for monotonic destination starts.
 * A down-step at the starting balance closes the destination; an up-step 33
 * levels above it exceeds cmark-gfm's nesting limit. Escapes have the same
 * parity globally and within a destination, which starts after `(` or space.
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1064-L1102
 */
export const indexDestinations = (text: string) => {
	let parenthesisCount = 0;
	let spaceCount = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
		} else if (code === 40 || code === 41) {
			parenthesisCount += 1;
		} else if (isCmarkSpace(code)) {
			spaceCount += 1;
		}
	}
	const levelCount = parenthesisCount * 2 + 2;
	const upOffsets = new Int32Array(levelCount);
	const downOffsets = new Int32Array(levelCount);
	const spaces = new Int32Array(spaceCount);
	let spaceIndex = 0;
	let balance = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
		} else if (code === 40) {
			balance += 1;
			upOffsets[balance + parenthesisCount + 1] += 1;
		} else if (code === 41) {
			downOffsets[balance + parenthesisCount + 1] += 1;
			balance -= 1;
		} else if (isCmarkSpace(code)) {
			spaces[spaceIndex] = index;
			spaceIndex += 1;
		}
	}
	// Counting sort groups each level's positions while preserving source order.
	for (let level = 1; level < levelCount; level += 1) {
		upOffsets[level] += upOffsets[level - 1];
		downOffsets[level] += downOffsets[level - 1];
	}
	const upPositions = new Int32Array(upOffsets[levelCount - 1]);
	const downPositions = new Int32Array(downOffsets[levelCount - 1]);
	const upCursors = upOffsets.slice();
	const downCursors = downOffsets.slice();
	balance = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
		} else if (code === 40) {
			balance += 1;
			const level = balance + parenthesisCount;
			upPositions[upCursors[level]] = index;
			upCursors[level] += 1;
		} else if (code === 41) {
			const level = balance + parenthesisCount;
			downPositions[downCursors[level]] = index;
			downCursors[level] += 1;
			balance -= 1;
		}
	}
	upCursors.set(upOffsets);
	downCursors.set(downOffsets);
	const next = (
		positions: Int32Array,
		offsets: Int32Array,
		cursors: Int32Array,
		level: number,
		start: number,
	) => {
		if (level < 0 || level + 1 >= levelCount) {
			return text.length;
		}
		let cursor = cursors[level];
		const end = offsets[level + 1];
		while (cursor < end && positions[cursor] < start) {
			cursor += 1;
		}
		cursors[level] = cursor;
		return cursor < end ? positions[cursor] : text.length;
	};
	let spaceCursor = 0;
	let balanceCursor = 0;
	let startBalance = 0;
	return (start: number) => {
		// Destination starts increase and cannot occur inside an escaped pair.
		while (balanceCursor < start) {
			const code = text.charCodeAt(balanceCursor);
			if (code === 92 && isAsciiPunctuation(text.charCodeAt(balanceCursor + 1))) {
				balanceCursor += 2;
			} else {
				startBalance += Number(code === 40) - Number(code === 41);
				balanceCursor += 1;
			}
		}
		while (spaceCursor < spaceCount && spaces[spaceCursor] < start) {
			spaceCursor += 1;
		}
		const whitespace = spaceCursor < spaceCount ? spaces[spaceCursor] : text.length;
		const level = startBalance + parenthesisCount;
		const close = next(downPositions, downOffsets, downCursors, level, start);
		const overflow = next(upPositions, upOffsets, upCursors, level + 33, start);
		const end = Math.min(whitespace, close);
		return end === text.length || overflow < end || whitespace === start ? -1 : end;
	};
};

// `scheme`: a letter, then letters, digits, `+`, `.`, or `-`, 2 to 32 in all.
const isSchemeChar = (code: number) => (
	isAsciiAlphanumeric(code) || code === 43 || code === 46 || code === 45
);

const emailLocalPunctuation = '.!#$%&\'*+/=?^_`{|}~-';

const isEmailLocalChar = (text: string, index: number) => (
	isAsciiAlphanumeric(text.charCodeAt(index)) || emailLocalPunctuation.includes(text[index])
);

/** `scan_autolink_uri` after the `<`: returns the index after the `>`, or -1. */
const matchUriAutolink = (text: string, index: number) => {
	if (!isAsciiLetter(text.charCodeAt(index))) {
		return -1;
	}
	let cursor = index + 1;
	while (isSchemeChar(text.charCodeAt(cursor))) {
		cursor += 1;
	}
	const schemeLength = cursor - index;
	if (schemeLength < 2 || schemeLength > 32 || text.charCodeAt(cursor) !== 58) {
		return -1;
	}
	// Anything but U+0001 to U+0020, `<`, and `>`. cmark-gfm reads NUL as
	// U+FFFD, so NUL is allowed.
	for (cursor += 1; cursor < text.length; cursor += 1) {
		const code = text.charCodeAt(cursor);
		if (code === 62) {
			return cursor + 1;
		}
		if ((code !== 0 && code <= 32) || code === 60) {
			return -1;
		}
	}
	return -1;
};

/** `scan_autolink_email` after the `<`: returns the index after the `>`, or -1. */
const matchEmailAutolink = (text: string, index: number) => {
	let cursor = index;
	while (cursor < text.length && isEmailLocalChar(text, cursor)) {
		cursor += 1;
	}
	if (cursor === index || text.charCodeAt(cursor) !== 64) {
		return -1;
	}

	// Labels of 1 to 63 letters, digits, and `-`, which start and end with a
	// letter or digit, separated by `.`.
	for (;;) {
		const labelStart = cursor + 1;
		cursor = labelStart;
		while (isAsciiAlphanumeric(text.charCodeAt(cursor)) || text.charCodeAt(cursor) === 45) {
			cursor += 1;
		}
		if (
			cursor === labelStart
			|| cursor - labelStart > 63
			|| !isAsciiAlphanumeric(text.charCodeAt(labelStart))
			|| !isAsciiAlphanumeric(text.charCodeAt(cursor - 1))
		) {
			return -1;
		}
		const code = text.charCodeAt(cursor);
		if (code === 62) {
			return cursor + 1;
		}
		if (code !== 46) {
			return -1;
		}
	}
};

/**
 * Matches an inline link's `(destination "title")` tail after `]`.
 * `matchLinkTail` returns the end past `)`, or -1, and `inlineTarget` builds
 * the last match's destination and title from their source ranges.
 */
export const createLinkTailMatcher = (text: string) => {
	// `scan_spacechars` differs from the whitespace in a reference definition.
	const skipInlineSpaces = (start: number) => {
		while (isSpaceChar(text.charCodeAt(start))) {
			start += 1;
		}
		return start;
	};
	let destinationIndex: ReturnType<typeof indexDestinations> | undefined;
	let destinationStart = 0;
	let destinationEnd = 0;
	let titleStart = 0;
	let titleEnd = 0;
	let destinationWork = 0;
	// Once direct scans have read more than the text, the index answers the rest.
	const scanUnbracketedDestination = (start: number) => {
		if (!destinationIndex && destinationWork > text.length) {
			destinationIndex = indexDestinations(text);
		}
		if (destinationIndex) {
			return destinationIndex(start);
		}
		const end = scanDestination(text, start);
		// A failed scan counts as reading to the end, which only builds the
		// index sooner.
		destinationWork += (end === -1 ? text.length : end) - start + 1;
		return end;
	};
	const matchLinkTail = (start: number) => {
		if (text.charCodeAt(start) !== 40) {
			return -1;
		}
		const destination = skipInlineSpaces(start + 1);
		let destinationClose: number;
		if (text.charCodeAt(destination) === 60) {
			destinationClose = scanDestination(text, destination);
		} else {
			destinationClose = scanUnbracketedDestination(destination);
		}
		if (destinationClose === -1) {
			return -1;
		}
		const titleOpen = skipInlineSpaces(destinationClose);
		const title = titleOpen === destinationClose ? -1 : scanTitle(text, titleOpen);
		const end = skipInlineSpaces(title === -1 ? titleOpen : title);
		if (text.charCodeAt(end) !== 41) {
			return -1;
		}
		destinationStart = destination;
		destinationEnd = destinationClose;
		titleStart = titleOpen;
		titleEnd = title === -1 ? titleOpen : title;
		return end + 1;
	};

	return {
		matchLinkTail,
		inlineTarget: () => ({
			destination: text.slice(destinationStart, destinationEnd),
			title: text.slice(titleStart, titleEnd),
		}),
	};
};

/** Returns the index after the autolink at the `<` at `index`, or -1. */
export const matchAutolink = (text: string, index: number) => {
	const uriEnd = matchUriAutolink(text, index + 1);
	return uriEnd === -1 ? matchEmailAutolink(text, index + 1) : uriEnd;
};
