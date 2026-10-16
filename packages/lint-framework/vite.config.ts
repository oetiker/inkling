import { resolve } from 'path';
import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		lib: {
			entry: resolve(import.meta.dirname, 'src/index.ts'),
			name: 'lintFramework',
			fileName: 'index',
			formats: ['es'],
		},
		minify: true,
		rolldownOptions: {
			output: {
				codeSplitting: false,
				minifyInternalExports: true,
			},
			treeshake: {
				moduleSideEffects: false,
				propertyReadSideEffects: false,
			},
		},
	},
	plugins: [
		dts({
			bundleTypes: true,
			tsconfigPath: './tsconfig.json',
			include: ['src'],
		}),
	],
});
