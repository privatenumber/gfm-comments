import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(fileURLToPath(import.meta.url), '../../..');

export const scriptArgs = () => {
	const args = process.argv.slice(2);
	if (args[0] === '--') {
		args.shift();
	}
	return args;
};

export const formatRow = (cells: string[], widths: number[]) => cells
	.map((cell, index) => (index === 0 ? cell.padEnd(widths[index]) : cell.padStart(widths[index])))
	.join('  ');

export const median = (values: number[]) => {
	const sorted = values.slice().sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
};

export const formatNumber = (value: number) => value.toLocaleString('en-US');

export const formatBytes = (bytes: number) => `${formatNumber(bytes)} bytes (${(bytes / 1024).toFixed(1)} KiB)`;

export const formatMegabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

export const formatMilliseconds = (milliseconds: number) => `${milliseconds.toFixed(2)} ms`;

export const formatRatio = (ratio: number) => ratio.toFixed(3);

export const formatNanosecondsPerCharacter = (milliseconds: number, characters: number) => `${((milliseconds * 1e6) / characters).toFixed(2)} ns/char`;

/**
 * Prints the facts a recorded measurement needs: when it ran, which machine
 * and runtime, and which checkout. The load average explains run-to-run drift.
 */
export const printEnvironment = () => {
	let commit = 'unknown';
	try {
		commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: root,
			encoding: 'utf8',
		}).trim();
	} catch {
		// Reporting the commit is informative; a source archive still benchmarks.
	}
	console.log(`date ${new Date().toISOString()}`);
	console.log(`node ${process.version}, ${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.platform()} ${os.release()}`);
	console.log(`commit ${commit}, load average ${os.loadavg().map(value => value.toFixed(2)).join(' ')}`);
};
