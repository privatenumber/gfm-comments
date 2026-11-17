import fs from 'node:fs';
import { describe, test, expect } from 'manten';
import { findComments, type Comment } from '../../src/index.ts';

/**
 * Each fixture is a synthetic document and the HTML that GitHub's `/markdown`
 * API returned for it. scripts/oracle/reprobe.ts records and rechecks them.
 *
 * GitHub strips every comment from its output, so the output shows which
 * text the comments hid, not the comments themselves. The test compares that
 * with the reported ranges through witnesses: strings in the source that
 * GitHub would show if they were not hidden. A witness is
 *
 * - a word of 2 or more uppercase letters and digits with at least one
 *   letter, such as `VISIBLE` or `A1`, that is not a tag name or `CDATA`, or
 * - a marker: `<!--` up to the next `>`, without `<`, such as `<!-- a -->`.
 *
 * For each witness string, the number of times it appears in GitHub's output,
 * after entities are decoded, must equal the number of times it appears in the
 * source outside every reported comment range. A reported range that holds
 * visible text, or a missed comment that hides a witness, changes the count.
 *
 * A reported comment that overlaps no witness changes no count, so the test
 * could not notice it missing. Each such comment must be listed in
 * `comments` as its `[start, end]` range, and every other reported comment
 * must overlap a witness.
 *
 * `hiddenOtherwise` counts the witnesses that GitHub hides by other means, such
 * as an unreferenced footnote definition or a dropped attribute, and
 * `hiddenReason` says which. `gap` marks a
 * known gap: the check must fail there, so a fix shows up as a failure that
 * asks to remove the mark. `evidenceOnly` says why a fixture without `<!--`
 * is kept: the scanner reports nothing for it, so it is not a scanner check.
 */
type GitHubProbe = {
	id: string;
	note: string;
	evidence: string;
	input: string;
	output: string;
	date: string;
	hiddenOtherwise?: Record<string, number>;
	hiddenReason?: string;
	comments?: [start: number, end: number][];
	gap?: string;
	evidenceOnly?: string;
};

const probes: GitHubProbe[] = JSON.parse(fs.readFileSync(new URL('../fixtures/github-probes.json', import.meta.url), 'utf8'));

const entities: Record<string, string> = {
	lt: '<',
	gt: '>',
	quot: '"',
	apos: '\'',
	amp: '&',
};

const decode = (html: string) => html.replaceAll(
	/&(?:#x([\da-f]+)|#(\d+)|([a-z]+));/gi,
	(entity, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
		if (hex) {
			return String.fromCodePoint(Number.parseInt(hex, 16));
		}
		if (decimal) {
			return String.fromCodePoint(Number(decimal));
		}
		return entities[name!] ?? entity;
	},
);

const count = (text: string, search: string) => text.split(search).length - 1;

// Each witness occurrence in the source, by its string.
const witnessesOf = (source: string) => {
	const witnesses = new Map<string, number[]>();
	const add = (text: string, index: number) => {
		witnesses.set(text, [...witnesses.get(text) ?? [], index]);
	};
	for (const { 0: word, index } of source.matchAll(/(?<![A-Za-z\d])[A-Z\d]{2,}(?![A-Za-z\d])/g)) {
		if (/[A-Z]/.test(word) && !/<\/?$|<!\[?$/.test(source.slice(0, index))) {
			add(word, index);
		}
	}
	for (const { 0: marker, index } of source.matchAll(/<!--[^<>]*>/g)) {
		add(marker, index);
	}
	return witnesses;
};

const checkWitnesses = (probe: GitHubProbe) => {
	const comments = findComments(probe.input);
	const output = decode(probe.output);
	const witnesses = witnessesOf(probe.input);
	const overlaps = (comment: Comment, index: number, witness: string) => (
		index < comment.end && comment.start < index + witness.length
	);
	const actual: Record<string, number> = {};
	const expected: Record<string, number> = {};
	for (const [witness, indexes] of witnesses) {
		const shown = indexes.filter(
			index => !comments.some(comment => overlaps(comment, index, witness)),
		);
		actual[witness] = count(output, witness);
		expected[witness] = shown.length - (probe.hiddenOtherwise?.[witness] ?? 0);
	}
	// A comment that hides no witness changes no count, so dropping it would
	// go unnoticed. Such comments must be listed in the fixture.
	const unwitnessed = comments
		.filter(comment => !witnesses.entries().some(
			([witness, indexes]) => indexes.some(index => overlaps(comment, index, witness)),
		))
		.map(comment => [comment.start, comment.end]);
	return {
		actual,
		expected,
		unwitnessed,
	};
};

describe('GitHub probes', () => {
	for (const probe of probes) {
		if (probe.evidenceOnly) {
			// Without `<!--`, the scanner reports nothing, so the check could
			// never fail. reprobe.ts still rechecks the recorded output.
			test(`${probe.id}: evidence only`, () => {
				expect(probe.input).not.toContain('<!--');
			});
			continue;
		}
		test(`${probe.id}: ${probe.note}`, () => {
			const { actual, expected, unwitnessed } = checkWitnesses(probe);
			expect(probe.input).toContain('<!--');
			expect(Object.keys(actual).length).toBeGreaterThan(0);
			expect(unwitnessed).toStrictEqual(probe.comments ?? []);
			if (probe.gap) {
				expect(actual).not.toStrictEqual(expected);
			} else {
				expect(actual).toStrictEqual(expected);
			}
		});
	}
});
