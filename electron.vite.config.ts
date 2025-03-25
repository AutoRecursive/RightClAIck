import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['ollama']
      },
      minify: false,
      sourcemap: 'inline'
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['ollama']
      },
      lib: {
        entry: resolve('src/preload/index.ts')
      },
      minify: false,
      sourcemap: 'inline'
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer')
      }
    },
    plugins: [vue()]
  }
}) 