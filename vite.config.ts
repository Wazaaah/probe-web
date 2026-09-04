import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative so a build drops onto any static host, including a subpath.
  base: './',
  build: { outDir: 'dist', sourcemap: false },
})
