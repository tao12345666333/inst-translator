import { defineConfig } from 'vite'
import webExtension from 'vite-plugin-web-extension'
import { viteStaticCopy } from 'vite-plugin-static-copy'

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
    viteStaticCopy({
      targets: [
        { src: 'icons/*', dest: 'icons' },
        { src: 'src/frame.html', dest: 'src' },
        { src: 'src/popup.html', dest: 'src' }
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
