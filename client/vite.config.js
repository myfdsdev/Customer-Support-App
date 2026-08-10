import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The proxy keeps the browser on one origin in development, so cookies and
// the Socket.io upgrade behave the same as they will in production.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Charts are admin-only and heavy; splitting them keeps the customer
        // support page — the one real users load — small.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          net: ['axios', 'socket.io-client'],
        },
      },
    },
  },
});
