import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        marcxml: resolve(__dirname, 'src/marcxml.ts'),
        marcjson: resolve(__dirname, 'src/marcjson.ts'),
      },
      name: 'MarcTS',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        if (format === 'es') return `${entryName}.js`;
        if (format === 'cjs') return `${entryName}.cjs`;
        return `${entryName}.${format}.js`;
      },
    },
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      // Ensure no dependencies are bundled (there should be none)
      external: [],
    },
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
      insertTypesEntry: true,
    }),
  ],
});
