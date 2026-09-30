import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so the build works from any folder or static host
  base: './',
  plugins: [react(), tailwindcss()],
})
