import zlib from 'node:zlib';
import { build, version } from 'esbuild';
import { root } from '../utils/report.ts';

export type ModuleSize = {
	path: string;
	bytes: number;
};

export type BundleSize = {
	minified: number;
	gzip: number;
	modules: ModuleSize[];
	esbuildVersion: string;
};

/**
 * Bundles the public entry with esbuild, using the minify options and target
 * that pkgroll passes when it builds `dist/index.mjs`, so this is a close proxy
 * for the published bundle. `gzip` compresses the minified bytes.
 */
export const measureBundle = async (): Promise<BundleSize> => {
	const result = await build({
		absWorkingDir: root,
		entryPoints: ['src/index.ts'],
		bundle: true,
		write: false,
		minify: true,
		// pkgroll's esbuild-minify plugin keeps names in minified output.
		keepNames: true,
		// pkgroll targets the current Node.js version plus the tsconfig target.
		target: [`node${process.versions.node}`, 'esnext'],
		format: 'esm',
		platform: 'node',
		metafile: true,
		logLevel: 'silent',
	});

	const output = result.outputFiles?.[0];
	const { metafile } = result;
	if (!output || !metafile) {
		throw new Error('esbuild returned no output or metafile');
	}

	const [outputName] = Object.keys(metafile.outputs);
	return {
		minified: output.contents.length,
		gzip: zlib.gzipSync(output.contents).length,
		modules: Object.entries(metafile.outputs[outputName].inputs)
			.map(([modulePath, input]) => ({
				path: modulePath,
				bytes: input.bytesInOutput,
			}))
			.sort((a, b) => b.bytes - a.bytes),
		esbuildVersion: version,
	};
};
