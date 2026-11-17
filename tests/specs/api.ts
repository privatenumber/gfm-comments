import { describe, test, expect } from 'manten';
import { findComments } from '../../src/index.ts';

describe('findComments', () => {
	test('returns no comments for a document without <!--', () => {
		expect(findComments('# Title\n\ntext')).toStrictEqual([]);
	});

	test('reports offsets of an inline comment', () => {
		expect(findComments('a <!-- x --> b')).toStrictEqual([{
			start: 2,
			end: 12,
			contentStart: 6,
			contentEnd: 9,
			nextLinePrefix: '',
			onCommentLine: false,
		}]);
	});

	test('skips comments in code', () => {
		expect(findComments('`<!-- x -->`\n\n```\n<!-- y -->\n```')).toStrictEqual([]);
	});

	test('reports a prefix that keeps a following line in the same containers', () => {
		expect(findComments('>Text <!-- a -->')[0].nextLinePrefix).toBe('> ');
		expect(findComments('1. <!-- a -->')[0].nextLinePrefix).toBe('   ');
		expect(findComments('> - <!-- x -->')[0].nextLinePrefix).toBe('>   ');
	});

	test('marks HTML block lines that start with a comment', () => {
		const source = '<!-- a --> <!-- b -->\n\n<div><!-- c -->\n\ntext <!-- d -->';
		const onCommentLine = findComments(source).map(comment => comment.onCommentLine);
		expect(onCommentLine).toStrictEqual([true, true, false, false]);
	});

	test('reports comments that end at a parse error', () => {
		const source = '<!--> <!---> <!-- x --!> <!-- y';
		expect(findComments(source).map(comment => [
			source.slice(comment.contentStart, comment.contentEnd),
			source.slice(comment.contentEnd, comment.end),
		])).toStrictEqual([
			['', '>'],
			['', '->'],
			[' x ', '--!>'],
			// Never closed, so it runs to the end of the document
			[' y', ''],
		]);
	});

	test('an empty closer is not followed by its own -->', () => {
		// The unclosed comment ends with its footnote definition, and GitHub
		// shows the `-->` that starts the next paragraph as text
		const source = 'text[^1]\n\n[^1]: <!-- a\n\n--> b <!-- /a -->\n';
		const closed = findComments(source).filter(comment => source.slice(comment.contentEnd, comment.end) === '-->');
		expect(closed.map(comment => source.slice(comment.start, comment.end))).toStrictEqual(['<!-- /a -->']);
	});

	test('reports offsets after a byte order mark', () => {
		expect(findComments('\uFEFF<!-- a -->').map(comment => [comment.start, comment.end])).toStrictEqual([[1, 11]]);
		expect(findComments('\uFEFF    <!-- a -->')).toStrictEqual([]);
	});

	test('does not report an unclosed comment inside a paragraph', () => {
		// cmark-gfm shows an inline `<!--` without `-->` as text
		expect(findComments('text <!-- y\n\nmore')).toStrictEqual([]);
	});
});
