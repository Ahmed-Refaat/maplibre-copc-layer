import { defineConfig, type Plugin } from 'vite';

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
	plugins: [glslPlugin()],
	build: {
		outDir: 'demo',
		assetsInlineLimit: 300000,
	},
	worker: {
		format: 'es',
	},
});
