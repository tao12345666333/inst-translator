import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Bundle with vite-plugin-web-extension (like openai-translator):
// - TS entries from manifest are built and manifest is rewritten to hashed files
// - Additional inputs (frame scripts) are bundled and exposed via chunk URL mapping
export default defineConfig({
  plugins: [
    webExtension({
      manifest: 'manifest.json',
      watchFilePaths: ['src', 'icons'],
      additionalInputs: [
        'src/frame-boot.ts',
        'src/popup.ts'
      ]
    }),
    // Copy static assets referenced by manifest at fixed paths
    viteStaticCopy({
      targets: [
        { src: 'icons/*', dest: 'icons' },
        { src: 'src/frame-boot.js', dest: 'src' },
        { src: 'src/popup.js', dest: 'src' }
      ]
    })
  ],
  build: {
    sourcemap: false,
    minify: 'esbuild',
    outDir: 'dist',
    emptyOutDir: true
  }
})
