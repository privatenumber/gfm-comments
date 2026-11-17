import { formatBytes, formatNumber } from '../utils/report.ts';
import { measureBundle } from './bundle.ts';

const size = await measureBundle();

console.log(`esbuild ${size.esbuildVersion}, ${size.modules.length} modules`);
console.log(`minified ${formatBytes(size.minified)}`);
console.log(`gzip     ${formatBytes(size.gzip)}`);
console.log('per module, bytes in the minified bundle:');
for (const module of size.modules) {
	console.log(`  ${formatNumber(module.bytes).padStart(7)}  ${module.path}`);
}
