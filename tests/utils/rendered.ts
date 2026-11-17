import { expect } from 'manten';
import { findComments } from '../../src/index.ts';

type Extra = {
	nextLinePrefix?: string;
	onCommentLine?: boolean;
	closer?: string;
};

export type RenderedComment = [start: number, content: string]
	| [start: number, content: string, extra: Extra];

/**
 * Summarizes the comments that render in `source`, one tuple per comment:
 * its start and its content, plus `nextLinePrefix`, `onCommentLine`, and `closer`
 * when they are not `''`, `false`, and `-->`. The other offsets follow from
 * these, which this helper checks, so a tuple still pins down every field.
 * It also checks that the ranges are in source order and disjoint.
 */
export const rendered = (
	source: string,
): RenderedComment[] => findComments(source).map((comment, index, comments) => {
	expect(comment.contentStart).toBe(comment.start + 4);
	if (index > 0) {
		expect(comment.start).toBeGreaterThanOrEqual(comments[index - 1].end);
	}
	// So an empty closer means `contentEnd === end`.
	expect(comment.end).toBeGreaterThanOrEqual(comment.contentEnd);
	const content = source.slice(comment.contentStart, comment.contentEnd);
	const closer = source.slice(comment.contentEnd, comment.end);
	expect(['-->', '--!>', '>', '->', ''].includes(closer)).toBe(true);
	const extra: Extra = {};
	if (closer !== '-->') {
		extra.closer = closer;
	}
	if (comment.nextLinePrefix !== '') {
		extra.nextLinePrefix = comment.nextLinePrefix;
	}
	if (comment.onCommentLine) {
		extra.onCommentLine = true;
	}
	return Object.keys(extra).length > 0
		? [comment.start, content, extra]
		: [comment.start, content];
});

/** The contents of the comments that render in `source`, in order. */
export const contents = (source: string) => findComments(source).map(
	comment => source.slice(comment.contentStart, comment.contentEnd),
);
