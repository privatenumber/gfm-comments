/**
 * A/B times two versions of the scanner in one process on the same corpus and
 * fixed workloads, alternating which version runs first in each round.
 *
 * Each side is either a git ref or a directory that contains `src/index.ts`,
 * so a worktree with uncommitted changes can be compared against `develop`.
 * Both sides are bundled with esbuild and imported as separate modules.
 *
 * Usage: pnpm bench:ab -- <base> <candidate> [--rounds=300] [--warmup=10]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
	mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { loadCorpus } from './inputs/corpus.ts';
import { createInputs } from './inputs/index.ts';
import {
	formatMilliseconds, formatNumber, formatRatio, formatRow, median,
	printEnvironment, root, scriptArgs,
} from './utils/report.ts';
import { workloads } from './inputs/workloads.ts';

/**
 * A comment from either version. The fields are read only as ordered values,
 * so a rename such as `startsLine` to `onCommentLine` does not break A/B.
 */
type FindComments = (source: string) => Array<Record<string, unknown>>;

type Side = {
	label: string;
	revision: string;
	findComments: FindComments;
	temporary: string;
};

const { values, positionals } = parseArgs({
	args: scriptArgs(),
	allowPositionals: true,
	options: {
		rounds: {
			type: 'string',
			default: '300',
		},
		warmup: {
			type: 'string',
			default: '10',
		},
	},
});

if (positionals.length !== 2) {
	throw new Error('Usage: pnpm bench:ab -- <base> <candidate> [--rounds=300] [--warmup=10]\n<base> and <candidate> are git refs or directories that contain src/index.ts.');
}

const rounds = Number(values.rounds);
const warmupRounds = Number(values.warmup);
if (!Number.isInteger(rounds) || rounds < 5) {
	throw new Error('--rounds must be an integer of at least 5');
}
if (!Number.isInteger(warmupRounds) || warmupRounds < 0) {
	throw new Error('--warmup must be an integer of at least 0');
}

const isDirectory = (value: string) => {
	try {
		return fs.statSync(value).isDirectory();
	} catch {
		return false;
	}
};

const extractRef = async (ref: string, destination: string) => {
	const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'src'], {
		cwd: root,
		encoding: 'utf8',
	}).split('\n').filter(file => file !== '');
	if (!files.includes('src/index.ts')) {
		throw new Error(`${ref} does not contain src/index.ts`);
	}

	for (const file of files) {
		const filePath = path.join(destination, file);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, execFileSync('git', ['show', `${ref}:${file}`], {
			cwd: root,
			maxBuffer: 16 * 1024 * 1024,
		}));
	}
};

const prepareSide = async (value: string): Promise<Side> => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), 'gfm-ab-'));
	try {
		const directory = isDirectory(value);
		const sourceDirectory = directory ? path.resolve(value) : temporary;
		const revision = directory
			? 'directory'
			: execFileSync('git', ['rev-parse', '--short', value], {
				cwd: root,
				encoding: 'utf8',
			}).trim();
		if (!directory) {
			await extractRef(value, temporary);
		}

		const bundlePath = path.join(temporary, 'bundle.mjs');
		await build({
			absWorkingDir: sourceDirectory,
			entryPoints: ['src/index.ts'],
			outfile: bundlePath,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			logLevel: 'silent',
		});

		const module = await import(pathToFileURL(bundlePath).href) as { findComments?: FindComments };
		if (typeof module.findComments !== 'function') {
			throw new TypeError(`${value} does not export findComments`);
		}
		return {
			label: value,
			revision,
			findComments: module.findComments,
			temporary,
		};
	} catch (error) {
		await rm(temporary, {
			recursive: true,
			force: true,
		});
		throw error;
	}
};

const scan = (findComments: FindComments, source: string) => {
	const comments = findComments(source);
	return {
		count: comments.length,
		digest: JSON.stringify(comments.map(comment => Object.values(comment))),
	};
};

const corpus = await loadCorpus();
const sides: Side[] = [];

try {
	sides[0] = await prepareSide(positionals[0]);
	sides[1] = await prepareSide(positionals[1]);
	const [base, candidate] = sides;

	const sources = [...corpus.documents, ...workloads.map(workload => workload.source)];
	let baseComments = 0;
	let candidateComments = 0;
	let different = 0;
	for (const source of sources) {
		const baseResult = scan(base.findComments, source);
		const candidateResult = scan(candidate.findComments, source);
		baseComments += baseResult.count;
		candidateComments += candidateResult.count;
		if (baseResult.digest !== candidateResult.digest) {
			different += 1;
		}
	}

	const results = createInputs(corpus).map(input => ({
		...input,
		times: {
			base: [] as number[],
			candidate: [] as number[],
		},
	}));

	printEnvironment();
	console.log(`base ${base.label} (${base.revision}), candidate ${candidate.label} (${candidate.revision})`);
	console.log(`rounds ${rounds}, warmup ${warmupRounds} rounds, alternating which side runs first`);
	console.log(`outputs: base ${formatNumber(baseComments)} comments, candidate ${formatNumber(candidateComments)} comments, ${different} of ${formatNumber(sources.length)} inputs differ`);
	console.log('');

	const baseSide = {
		key: 'base' as const,
		findComments: base.findComments,
	};
	const candidateSide = {
		key: 'candidate' as const,
		findComments: candidate.findComments,
	};

	for (let round = 0; round < warmupRounds; round += 1) {
		for (const result of results) {
			result.run(base.findComments);
			result.run(candidate.findComments);
		}
	}

	for (let round = 0; round < rounds; round += 1) {
		const orderedSides = round % 2 === 0
			? [baseSide, candidateSide]
			: [candidateSide, baseSide];
		for (const result of results) {
			for (const side of orderedSides) {
				const start = performance.now();
				result.run(side.findComments);
				result.times[side.key].push(performance.now() - start);
			}
		}
	}

	const widths = [24, 11, 13, 13, 8];

	console.log(formatRow(['input', 'chars', 'base median', 'candidate median', 'ratio'], widths));
	for (const result of results) {
		const baseMedian = median(result.times.base);
		const candidateMedian = median(result.times.candidate);
		const ratios = result.times.base.map((time, index) => result.times.candidate[index] / time);
		const ratio = median(ratios);
		console.log(formatRow([
			result.name,
			formatNumber(result.characters),
			formatMilliseconds(baseMedian),
			formatMilliseconds(candidateMedian),
			formatRatio(ratio),
		], widths));
	}
	console.log('');
	console.log('ratio = candidate / base; below 1 means the candidate is faster');
} finally {
	await Promise.all(sides.map(side => rm(side.temporary, {
		recursive: true,
		force: true,
	})));
}
