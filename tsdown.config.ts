import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite-plus/pack';

const _require = createRequire(import.meta.url);
const copcRequire = createRequire(_require.resolve('copc/package.json'));
const lazPerfDir = dirname(copcRequire.resolve('laz-perf/package.json'));
const lazPerfWasmSrc = resolve(lazPerfDir, 'lib/web/laz-perf.wasm');

export default defineConfig({
	dts: {
		tsgo: true,
	},
	exports: {
		customExports: {
			'./laz-perf.wasm': './dist/laz-perf.wasm',
		},
	},
	loader: {
		'.glsl': 'text',
	},
	hooks: {
		'build:done': () => {
			copyFileSync(lazPerfWasmSrc, resolve('dist', 'laz-perf.wasm'));
			console.log('Copied laz-perf.wasm to dist/');
		},
	},
});
