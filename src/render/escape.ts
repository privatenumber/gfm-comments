/**
 * The renderer's escapes for generated markup. Their output decides which
 * characters the HTML tokenizer reads inside an attribute value.
 */

// Node.js 22, the package's minimum, supports toWellFormed. cmark-gfm reads
// NUL as U+FFFD, and UTF-8 encoding writes a lone surrogate as U+FFFD.
export const normalizeInput = (text: string) => text.toWellFormed().replaceAll('\0', '�');

/**
 * `escape_html`, which is `houdini_escape_html0` without its secure flag, so
 * `'` and `/` stay as they are:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/houdini_html_e.c#L35-L62
 */
export const escapeHtml = (text: string) => text
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;');

// `HREF_SAFE`: https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/houdini_href_e.c#L7-L31
const isHrefSafe = (byte: number) => (
	(byte >= 97 && byte <= 122)
	|| (byte >= 63 && byte <= 90)
	|| (byte >= 40 && byte <= 59)
	|| byte === 33 || byte === 35 || byte === 36 || byte === 37
	|| byte === 61 || byte === 95 || byte === 126
);

const utf8 = new TextEncoder();

/**
 * `houdini_escape_href` on the text's UTF-8 bytes, after `normalizeInput`.
 * The result holds no quote, `<`, `>`, or whitespace.
 */
export const escapeHref = (text: string) => {
	let escaped = '';
	for (const byte of utf8.encode(normalizeInput(text))) {
		if (isHrefSafe(byte)) {
			escaped += String.fromCharCode(byte);
		} else if (byte === 38) {
			escaped += '&amp;';
		} else if (byte === 39) {
			escaped += '&#x27;';
		} else {
			escaped += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
		}
	}
	return escaped;
};
