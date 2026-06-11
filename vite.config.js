import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      // en dev, /api/gen lo responde server.mjs (npm start en otra terminal)
      '/api': 'http://localhost:8642',
    },
  },
})
