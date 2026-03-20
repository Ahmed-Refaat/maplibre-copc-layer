import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

function glslPlugin(): Plugin {
	return {
		name: 'glsl-loader',
		transform(code, id) {
			if (id.endsWith('.glsl')) {
				return {
					code: `export default ${JSON.stringify(code)}`,
					map: null,
				};
			}
		},
	};
}

export default defineConfig({
	plugins: [glslPlugin(), dts({ rollupTypes: true })],
	build: {
		lib: {
			entry: resolve('src/index.ts'),
			formats: ['es'],
			fileName: 'index',
		},
		assetsInlineLimit: 300000,
		rollupOptions: {
			external: ['maplibre-gl', 'three', 'copc', 'proj4'],
		},
	},
	worker: {
		format: 'es',
	},
});
