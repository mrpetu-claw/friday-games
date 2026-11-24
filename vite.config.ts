import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base + hash routing lets the same build run from any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
} as never)
