import { describe, test, expect } from 'manten';
import { contents } from '../../utils/rendered.ts';

// cmark-gfm limits how many bytes reference links and images may expand to.
// Past the budget, a reference renders as literal text, so a comment inside
// its label renders too.
describe('reference expansion budget', () => {
	test('uses decoded named entity sizes at the budget boundary', () => {
		// cmark-gfm 0.29.0.gfm.13 renders only the outer comments in each case.
		// The table holds every entity that decodes to an ASCII value, so these
		// stay exact; a non-ASCII value is counted by its source bytes instead,
		// as notes/gfm-comments/known-gaps.md records.
		for (const destination of [
			'&amp;'.repeat(200),
			'&amp;'.repeat(600),
			`${'u'.repeat(800)}${'&amp;'.repeat(200)}`,
			`${'u'.repeat(987)}&notanentity;`,
			`${'u'.repeat(996)}&amp`,
			`${'u'.repeat(999)}&bsol;&excl;`,
		]) {
			const source = `${'[r] '.repeat(99)}x <!-- a -->PRESERVE ![<!-- a -->inner][r] tail<!-- /a -->\n\n[r]: ${destination}`;
			expect(contents(source)).toStrictEqual([' a ', ' /a ']);
		}
	});

	test('leaves the image literal just beyond the entity-sized boundary', () => {
		// `&amp;` decodes to one byte, which the table holds exactly.
		const source = (extra: number) => `${'[r] '.repeat(99)}![<!-- a -->inner][s] <!-- /a -->\n\n[r]: ${'u'.repeat(1000)}\n[s]: ${'u'.repeat(800 + extra)}${'&amp;'.repeat(200)}`;
		expect(contents(source(0))).toStrictEqual([' /a ']);
		expect(contents(source(1))).toStrictEqual([' a ', ' /a ']);
	});

	test('counts numeric noncharacters as one byte', () => {
		// cmark-gfm 0.29.0.gfm.13 renders only the outer comments.
		for (const code of [65_534, 65_535]) {
			const source = `${'[r] '.repeat(150)}x <!-- a -->PRESERVE ![<!-- a -->inner][r] tail<!-- /a -->\n\n[r]: ${`&#${code};`.repeat(334)}`;
			expect(contents(source)).toStrictEqual([' a ', ' /a ']);
		}
	});

	test('charges a rewound title without consuming its paragraph', () => {
		// cmark-gfm 0.29.0.gfm.13 renders both opening comments.
		const source = `${'[r] '.repeat(99)}x <!-- a -->PRESERVE ![<!-- a -->inner][r] tail<!-- /a -->\n\n[r]: /u\n"${'t'.repeat(1000)}" trailing`;
		expect(contents(source)).toStrictEqual([' a ', ' a ', ' /a ']);
	});

	test('renders the image label as text when an image exceeds the budget', () => {
		// GitHub /markdown probe, Sat Nov 14: 98 references resolve the image;
		// 101 references leave it as text.
		const source = (count: number) => `${'[r] '.repeat(count)}x <!-- a -->PRESERVE ![<!-- a -->old][r] tail<!-- /a --> KEEP\n\n[r]: ${'u'.repeat(1000)}`;
		expect(contents(source(98))).toStrictEqual([' a ', ' /a ']);
		expect(contents(source(101))).toStrictEqual([' a ', ' a ', ' /a ']);
	});

	test('a failed large lookup does not consume the remaining budget', () => {
		// cmark-gfm 0.29.0.gfm.13 renders `![<!-- a -->old][large]` as text and
		// resolves `![<!-- b -->x][small]`, so only the `a` comments render.
		const source = `${'[r] '.repeat(99)}![<!-- a -->old<!-- /a -->][large] ![<!-- b -->x<!-- /b -->][small]\n\n`
			+ `[r]: ${'u'.repeat(1000)}\n[large]: ${'u'.repeat(1001)}\n[small]: /x`;
		expect(contents(source)).toStrictEqual([' a ', ' /a ']);
	});

	test('a decoded entity completes a backslash escape', () => {
		// `\&bne;` decodes to `\=` and a combining character, and cmark-gfm then
		// removes the backslash, so `[r]` costs 801 bytes. All 100 uses fit, 33
		// `[t]` uses fill the budget, and `![…][s]` renders as text. cmark-gfm
		// 0.29.0.gfm.13 renders both `<!-- a -->` openers.
		const source = `${'[r] '.repeat(100)}${'[t] '.repeat(40)}x <!-- a -->PRESERVE ![<!-- a -->old][s] tail<!-- /a -->\n\n[r]: `
			+ `${String.raw`\&bne;`.repeat(200)}u\n[t]: ${'t'.repeat(600)}\n[s]: ${'s'.repeat(200)}`;
		expect(contents(source)).toStrictEqual([' a ', ' a ', ' /a ']);
	});

	test('counts decoded numeric entities and normalized title line endings', () => {
		for (const definition of [
			`[s]: ${'u'.repeat(999)}&#x75;`,
			String.raw`[s]: ${'u'.repeat(999)}\!`,
			`[s]: < ${'u'.repeat(1000)} >`,
			`[s]: / "${'t'.repeat(997)}\r\nx"`,
		]) {
			const source = `${'[r] '.repeat(99)}![<!-- a -->old][s] <!-- /a -->\n\n`
				+ `[r]: ${'u'.repeat(1000)}\n${definition}`;
			expect(contents(source)).toStrictEqual([' /a ']);
		}
	});

	test('counts NUL and lone surrogates as replacement characters in definitions', () => {
		for (const character of ['\0', '\uD800']) {
			const source = `${'[r] '.repeat(33)}![<!-- a -->old][r] <!-- /a -->\n\n`
				+ `[r]: ${character.repeat(1000)}`;
			expect(contents(source)).toStrictEqual([' a ', ' /a ']);
		}
	});
});
