import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The published JSON (experiment 024) is served separately. The dev server
// proxies the data paths so the app can fetch them same-origin.
const dataOrigin = process.env.DATA_ORIGIN || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Requests that arrive as http://odesktop:… are otherwise rejected.
    allowedHosts: ['odesktop'],
    proxy: {
      '/directory.json': dataOrigin,
      '/articles': dataOrigin,
      '/frontmatter': dataOrigin,
      '/backlinks': dataOrigin,
      '/assets': dataOrigin,
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
