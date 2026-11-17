/**
 * Profiles the corpus scan in this process. CPU self time is aggregated by
 * source module with `node:inspector` Profiler samples, and allocation is
 * aggregated by function with HeapProfiler sampling.
 *
 * Usage: pnpm bench:profile [--cpu-passes=50] [--heap-passes=20]
 */
import inspector from 'node:inspector';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findComments } from '../src/index.ts';
import { loadCorpus, scanCorpus } from './inputs/corpus.ts';
import {
	formatMegabytes, formatMilliseconds, formatNumber, printEnvironment, root, scriptArgs,
} from './utils/report.ts';

type CallFrame = {
	functionName: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
};

type CpuProfileNode = {
	id: number;
	callFrame: CallFrame;
};

type CpuProfile = {
	nodes: CpuProfileNode[];
	samples: number[];
	timeDeltas: number[];
};

type HeapProfileNode = {
	callFrame: CallFrame;
	selfSize: number;
	children: HeapProfileNode[];
};

const { values } = parseArgs({
	args: scriptArgs(),
	options: {
		'cpu-passes': {
			type: 'string',
			default: '50',
		},
		'heap-passes': {
			type: 'string',
			default: '20',
		},
	},
});
const cpuPasses = Number(values['cpu-passes']);
const heapPasses = Number(values['heap-passes']);
if (!Number.isInteger(cpuPasses) || cpuPasses < 1) {
	throw new Error('--cpu-passes must be an integer of at least 1');
}
if (!Number.isInteger(heapPasses) || heapPasses < 1) {
	throw new Error('--heap-passes must be an integer of at least 1');
}

const post = <Result>(
	session: inspector.Session,
	method: string,
	parameters: Record<string, unknown> = {},
) => new Promise<Result>((resolve, reject) => {
	session.post(method, parameters, (error, result) => {
		if (error) {
			reject(error);
		} else {
			resolve(result as Result);
		}
	});
});

const moduleName = (frame: CallFrame) => {
	let { url } = frame;
	if (url.startsWith('file://')) {
		url = fileURLToPath(url);
	}
	if (url === '') {
		return frame.functionName || '(native)';
	}
	if (url.startsWith('node:')) {
		return '(node builtins)';
	}
	const relative = path.relative(root, url);
	return relative.startsWith('..') || path.isAbsolute(relative) ? url : relative;
};

const functionName = (frame: CallFrame) => {
	const name = frame.functionName || '(anonymous)';
	return frame.url === '' ? name : `${name}  ${moduleName(frame)}:${frame.lineNumber + 1}`;
};

const corpus = await loadCorpus();
printEnvironment();
console.log(`corpus ${corpus.documents.length} files, ${formatNumber(corpus.characters)} characters`);
console.log('');

const runPasses = (passes: number) => {
	let comments = 0;
	for (let pass = 0; pass < passes; pass += 1) {
		comments = scanCorpus(corpus.documents, findComments);
	}
	return comments;
};

const cpuSession = new inspector.Session();
cpuSession.connect();
await post(cpuSession, 'Profiler.enable');
await post(cpuSession, 'Profiler.setSamplingInterval', { interval: 100 });
await post(cpuSession, 'Profiler.start');
const cpuComments = runPasses(cpuPasses);
const { profile: cpuProfile } = await post<{ profile: CpuProfile }>(cpuSession, 'Profiler.stop');
cpuSession.disconnect();

const nodesById = new Map(cpuProfile.nodes.map(node => [node.id, node]));
const moduleTimes = new Map<string, number>();
let sampledMicroseconds = 0;
for (const [index, nodeId] of cpuProfile.samples.entries()) {
	const node = nodesById.get(nodeId);
	const microseconds = cpuProfile.timeDeltas[index] ?? 0;
	const name = node ? moduleName(node.callFrame) : '(unknown)';
	moduleTimes.set(name, (moduleTimes.get(name) ?? 0) + microseconds);
	sampledMicroseconds += microseconds;
}

console.log(`CPU self time, ${cpuPasses} corpus passes, ${formatMilliseconds(sampledMicroseconds / 1000)}, ${formatNumber(cpuComments)} comments, 100 us sampling`);
const moduleRows = [...moduleTimes.entries()]
	.map(([name, microseconds]) => ({
		name,
		milliseconds: microseconds / 1000,
		share: microseconds / sampledMicroseconds,
	}))
	.sort((a, b) => b.milliseconds - a.milliseconds);
for (const module of moduleRows) {
	console.log(`${(module.share * 100).toFixed(1).padStart(5)}%  ${formatMilliseconds(module.milliseconds).padStart(10)}  ${module.name}`);
}
console.log('');

const heapSession = new inspector.Session();
heapSession.connect();
await post(heapSession, 'HeapProfiler.enable');
await post(heapSession, 'HeapProfiler.startSampling', {
	samplingInterval: 1024,
	includeObjectsCollectedByMajorGC: true,
	includeObjectsCollectedByMinorGC: true,
});
const heapComments = runPasses(heapPasses);
const { profile: heapProfile } = await post<{ profile: { head: HeapProfileNode } }>(heapSession, 'HeapProfiler.stopSampling');
heapSession.disconnect();

const allocations = new Map<string, number>();
let allocatedBytes = 0;
const walk = (node: HeapProfileNode) => {
	allocatedBytes += node.selfSize;
	if (node.selfSize > 0) {
		const name = functionName(node.callFrame);
		allocations.set(name, (allocations.get(name) ?? 0) + node.selfSize);
	}
	for (const child of node.children) {
		walk(child);
	}
};
walk(heapProfile.head);

console.log(`allocation, ${heapPasses} corpus passes, ${formatMegabytes(allocatedBytes)} sampled, ${formatNumber(heapComments)} comments, 1 KiB sampling interval`);
console.log(`${formatMegabytes(allocatedBytes / heapPasses)} allocated per pass`);
const allocationRows = [...allocations.entries()]
	.map(([name, bytes]) => ({
		name,
		bytes,
		share: bytes / allocatedBytes,
	}))
	.sort((a, b) => b.bytes - a.bytes)
	.slice(0, 20);
for (const allocation of allocationRows) {
	console.log(`${(allocation.share * 100).toFixed(1).padStart(5)}%  ${formatMegabytes(allocation.bytes).padStart(9)}  ${allocation.name}`);
}
