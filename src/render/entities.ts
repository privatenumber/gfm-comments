import { isAsciiAlphanumeric, isAsciiPunctuation } from '../utils/ascii.ts';
import { isSurrogate } from '../utils/surrogate.ts';

// Generated from src/entities.inc in cmark-gfm 0.29.0.gfm.13. To regenerate,
// see "Entity table" in notes/gfm-comments/github-oracle.md.
// Each group holds the decoded byte length, the first decoded byte, and the
// names that start with it. Only the 49 names whose first decoded byte is
// ASCII are kept: a dropped name is never decoded, its source text is escaped,
// and no tokenizer state transition compares a non-ASCII character. The
// reference budget counts a dropped name's source bytes, which
// notes/gfm-comments/known-gaps.md records.
type Entity = [bytes: number, first: number, names: string];

const digitValue = (digit: number, hex: boolean) => {
	if (digit >= 48 && digit <= 57) {
		return digit - 48;
	}
	if (hex && digit >= 65 && digit <= 70) {
		return digit - 55;
	}
	if (hex && digit >= 97 && digit <= 102) {
		return digit - 87;
	}
	return -1;
};

// Houdini accepts at most eight digits and replaces invalid code points.
const numericEntity = (text: string, index: number) => {
	let cursor = index + 2;
	const hex = text[cursor] === 'x' || text[cursor] === 'X';
	if (hex) {
		cursor += 1;
	}
	const start = cursor;
	let code = 0;
	while (cursor < text.length) {
		const value = digitValue(text.charCodeAt(cursor), hex);
		if (value < 0) {
			break;
		}
		code = Math.min(0x11_00_00, code * (hex ? 16 : 10) + value);
		cursor += 1;
	}
	if (cursor === start || cursor - start > 8 || text[cursor] !== ';') {
		return undefined;
	}
	return {
		code: code !== 0 && code < 0x11_00_00 && !isSurrogate(code) ? code : 0xFF_FD,
		end: cursor,
	};
};

const groups: Entity[] = [
	[1, 9, 'Tab'],
	[1, 10, 'NewLine'],
	[1, 33, 'excl'],
	[1, 34, 'QUOT quot'],
	[1, 35, 'num'],
	[1, 36, 'dollar'],
	[1, 37, 'percnt'],
	[1, 38, 'AMP amp'],
	[1, 39, 'apos'],
	[1, 40, 'lpar'],
	[1, 41, 'rpar'],
	[1, 42, 'ast midast'],
	[1, 43, 'plus'],
	[1, 44, 'comma'],
	[1, 46, 'period'],
	[1, 47, 'sol'],
	[1, 58, 'colon'],
	[1, 59, 'semi'],
	[1, 60, 'LT lt'],
	[1, 61, 'equals'],
	[1, 62, 'GT gt'],
	[1, 63, 'quest'],
	[1, 64, 'commat'],
	[1, 91, 'lbrack lsqb'],
	[1, 92, 'bsol'],
	[1, 93, 'rbrack rsqb'],
	[1, 94, 'Hat'],
	[1, 95, 'UnderBar lowbar'],
	[1, 96, 'DiacriticalGrave grave'],
	[1, 123, 'lbrace lcub'],
	[1, 124, 'VerticalLine verbar vert'],
	[1, 125, 'rbrace rcub'],
	[2, 102, 'fjlig'],
	[4, 60, 'nvlt'],
	[4, 61, 'bne'],
	[4, 62, 'nvgt'],
];

let entities: Map<string, Entity> | undefined;

const namedEntity = (name: string) => {
	if (!entities) {
		entities = new Map();
		for (const group of groups) {
			for (const entry of group[2].split(' ')) {
				entities.set(entry, group);
			}
		}
	}
	return entities.get(name);
};

/**
 * The index of the `;` that ends the named entity at `text[index]`, or -1.
 * Houdini searches names of 2 to 31 bytes.
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/houdini_html_u.c#L80-L100
 */
export const scanEntityName = (text: string, index: number) => {
	let end = index + 1;
	while (
		end < text.length
		&& end - index <= 31
		&& isAsciiAlphanumeric(text.charCodeAt(end))
	) {
		end += 1;
	}
	return end - index >= 3 && end < text.length && text.charCodeAt(end) === 59 ? end : -1;
};

export const decodeEntity = (text: string, index: number) => {
	if (text.startsWith('&#', index)) {
		const entity = numericEntity(text, index);
		if (!entity) {
			return undefined;
		}
		const { code, end } = entity;
		// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/utf8.c#L202-L207
		let bytes: number;
		if (code === 0xFF_FE || code === 0xFF_FF || code < 0x80) {
			bytes = 1;
		} else if (code < 0x8_00) {
			bytes = 2;
		} else if (code < 0x1_00_00) {
			bytes = 3;
		} else {
			bytes = 4;
		}
		return {
			bytes,
			code,
			end,
		};
	}
	// The table contains only ASCII letters and digits.
	// https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/houdini_html_u.c#L10-L35
	const nameEnd = scanEntityName(text, index);
	if (nameEnd !== -1) {
		const entity = namedEntity(text.slice(index + 1, nameEnd));
		if (entity) {
			return {
				bytes: entity[0],
				code: entity[1],
				end: nameEnd,
			};
		}
	}
	return undefined;
};

/**
 * The decoded text for the entity that `decodeEntity` returned at `index`.
 * A numeric noncharacter becomes U+FFFD, `fjlig` becomes `fj`, and a named
 * value keeps its ASCII first byte plus U+FFFD for the rest.
 */
export const decodedUnit = (
	text: string,
	index: number,
	entity: {
		code: number;
		bytes: number;
	},
) => {
	if (text.charCodeAt(index + 1) === 35) {
		// These two code points are emitted as invalid UTF-8 by cmark.
		return String.fromCodePoint(
			entity.code === 0xFF_FE || entity.code === 0xFF_FF ? 0xFF_FD : entity.code,
		);
	}
	if (text.startsWith('fjlig;', index + 1)) {
		return 'fj';
	}
	return String.fromCharCode(entity.code) + (entity.bytes > 1 ? '\uFFFD' : '');
};

/**
 * Decodes entities as `houdini_unescape_html_f` does, for the names whose
 * first decoded byte is ASCII. A value that starts with ASCII keeps that byte
 * and then U+FFFD for the rest, and a dropped name stays as its source text.
 * The renderer escapes `&`, `<`, `>`, and `"` in the result before the HTML
 * tokenizer reads it: a non-ASCII character and the `&`, `;`, and name
 * characters of an undecoded entity cannot end a tag, attribute value, or
 * comment. `&fjlig;` is the only value with more than one ASCII character.
 */
export const decodeEntities = (raw: string) => {
	let decoded = '';
	for (let index = 0; index < raw.length; index += 1) {
		const entity = raw.charCodeAt(index) === 38 ? decodeEntity(raw, index) : undefined;
		if (!entity) {
			decoded += raw[index];
			continue;
		}
		decoded += decodedUnit(raw, index, entity);
		index = entity.end;
	}
	return decoded;
};

/** `cmark_strbuf_unescape`: removes each backslash before ASCII punctuation. */
export const unescapeBackslashes = (text: string) => {
	if (!text.includes('\\')) {
		return text;
	}
	let unescaped = '';
	for (let index = 0; index < text.length; index += 1) {
		if (text.charCodeAt(index) === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
		}
		unescaped += text[index];
	}
	return unescaped;
};
