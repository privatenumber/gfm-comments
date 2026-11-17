import { isAsciiPunctuation, isCmarkSpace } from '../utils/ascii.ts';
import { isHighSurrogate, isLowSurrogate } from '../utils/surrogate.ts';
import { utf8Length } from '../utils/utf8.ts';

/**
 * Link labels, as GitHub's renderer, cmark-gfm 0.29.0.gfm.13, scans and
 * normalizes them for reference definitions, links, and images:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1022-L1062
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/map.c#L9-L32
 */

// In UTF-8 bytes, as cmark-gfm reads its input.
const maxLabelLength = 1000;

/** `link_label`: returns the index after the `]`, or -1. */
export const scanLabel = (text: string, index: number, allowBlank = false) => {
	let length = 0;
	let blank = true;
	for (index += 1; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 91) {
			return -1;
		}
		if (code === 93) {
			return blank && !allowBlank ? -1 : index + 1;
		}
		blank &&= isCmarkSpace(code);
		if (code === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
			length += 1;
		}
		length += utf8Length(text, index);
		if (length > maxLabelLength) {
			return -1;
		}
	}
	return -1;
};

// These 185 scalars fold to themselves in cmark-gfm 0.29.0.gfm.13, but
// JavaScript's case mappings in Unicode 17.0 (Node 26) merge them with other
// scalars. To regenerate, see "Reference label case folding" in
// notes/gfm-comments/github-oracle.md.
const foldExceptions = new Set<number>();
for (const [start, end] of [
	[0x1_31, 0x1_31],
	[0x1_9B, 0x1_9B],
	[0x2_64, 0x2_64],
	[0x2_82, 0x2_82],
	[0x10_D0, 0x10_FA],
	[0x10_FD, 0x10_FF],
	[0x1C_8A, 0x1C_8A],
	[0x1D_8E, 0x1D_8E],
	[0x2C_5F, 0x2C_5F],
	[0xA7_94, 0xA7_94],
	[0xA7_B9, 0xA7_B9],
	[0xA7_BB, 0xA7_BB],
	[0xA7_BD, 0xA7_BD],
	[0xA7_BF, 0xA7_BF],
	[0xA7_C1, 0xA7_C1],
	[0xA7_C3, 0xA7_C3],
	[0xA7_C8, 0xA7_C8],
	[0xA7_CA, 0xA7_CA],
	[0xA7_CD, 0xA7_CD],
	[0xA7_CF, 0xA7_CF],
	[0xA7_D1, 0xA7_D1],
	[0xA7_D3, 0xA7_D3],
	[0xA7_D5, 0xA7_D5],
	[0xA7_D7, 0xA7_D7],
	[0xA7_D9, 0xA7_D9],
	[0xA7_DB, 0xA7_DB],
	[0xA7_F6, 0xA7_F6],
	[0x01_05_97, 0x01_05_A1],
	[0x01_05_A3, 0x01_05_B1],
	[0x01_05_B3, 0x01_05_B9],
	[0x01_05_BB, 0x01_05_BC],
	[0x01_0D_70, 0x01_0D_85],
	[0x01_6E_60, 0x01_6E_7F],
	[0x01_6E_BB, 0x01_6E_D3],
]) {
	for (let code = start; code <= end; code += 1) {
		foldExceptions.add(code);
	}
}

// cmark folds Unicode case, trims, and collapses ASCII whitespace.
export const normalizeLabel = (label: string) => {
	let ascii = label.length <= maxLabelLength;
	for (let index = 0; ascii && index < label.length; index += 1) {
		const code = label.charCodeAt(index);
		ascii = code > 0 && code < 128 && !isCmarkSpace(code);
	}
	if (ascii) {
		return label.toUpperCase();
	}
	let normalized = '';
	let space = false;
	let length = 0;
	for (let index = 0; index < label.length; index += 1) {
		length += utf8Length(label, index);
		if (length > maxLabelLength) {
			return '';
		}
		const code = label.charCodeAt(index);
		if (isCmarkSpace(code)) {
			space = normalized.length > 0;
		} else {
			if (space) {
				normalized += ' ';
				space = false;
			}
			const invalid = code === 0
				|| (isHighSurrogate(code) && !isLowSurrogate(label.charCodeAt(index + 1)))
				|| (isLowSurrogate(code) && !isHighSurrogate(label.charCodeAt(index - 1)));
			normalized += invalid ? '\uFFFD' : label[index];
		}
	}
	let folded = '';
	let start = 0;
	for (let index = 0; index < normalized.length;) {
		const code = normalized.codePointAt(index)!;
		const size = code > 0xFF_FF ? 2 : 1;
		if (foldExceptions.has(code)) {
			folded += normalized.slice(start, index).toLowerCase().toUpperCase();
			folded += normalized.slice(index, index + size);
			start = index + size;
		}
		index += size;
	}
	return folded + normalized.slice(start).toLowerCase().toUpperCase();
};
