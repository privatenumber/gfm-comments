/**
 * Times `findComments` on the `node_modules` corpus and on the fixed workloads
 * in `inputs/workloads.ts`. It needs no oracle build, unlike `bench/index.ts`, which
 * also grades the scanner against cmark-gfm.
 *
 * Usage: pnpm bench:time [--rounds=100]
 */
import { parseArgs } from 'node:util';
import { findComments } from '../src/index.ts';
import { loadCorpus, scanCorpus } from './inputs/corpus.ts';
import { createInputs } from './inputs/index.ts';
import {
	formatMilliseconds, formatNanosecondsPerCharacter, formatNumber, formatRow,
	median, printEnvironment, scriptArgs,
} from './utils/report.ts';

const { values } = parseArgs({
	args: scriptArgs(),
	options: {
		rounds: {
			type: 'string',
			default: '100',
		},
	},
});
const rounds = Number(values.rounds);
if (!Number.isInteger(rounds) || rounds < 5) {
	throw new Error('--rounds must be an integer of at least 5');
}

const corpus = await loadCorpus();
printEnvironment();
console.log(`corpus ${corpus.documents.length} files, ${formatNumber(corpus.characters)} characters, ${formatNumber(scanCorpus(corpus.documents, findComments))} comments`);
console.log(`rounds ${rounds}, warmup at least 250 ms per input`);
console.log('');

const inputs = createInputs(corpus);

const measure = (run: () => number) => {
	const warmupStart = performance.now();
	let warmupRuns = 0;
	while (performance.now() - warmupStart < 250 || warmupRuns < 3) {
		run();
		warmupRuns += 1;
	}

	const times: number[] = [];
	let comments = 0;
	for (let round = 0; round < rounds; round += 1) {
		const start = performance.now();
		comments = run();
		times.push(performance.now() - start);
	}
	return {
		times,
		comments,
	};
};

const widths = [24, 11, 11, 10, 10, 9];

console.log(formatRow(['input', 'chars', 'median', 'min', 'ns/char', 'comments'], widths));
for (const input of inputs) {
	const { times, comments } = measure(() => input.run(findComments));
	const middle = median(times);
	const minimum = Math.min(...times);
	console.log(formatRow([
		input.name,
		formatNumber(input.characters),
		formatMilliseconds(middle),
		formatMilliseconds(minimum),
		formatNanosecondsPerCharacter(middle, input.characters),
		formatNumber(comments),
	], widths));
}
