import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:41900',
      '/stitch': 'http://127.0.0.1:41900',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/elkjs')) return 'vendor-elk';
          if (id.includes('node_modules/uplot')) return 'vendor-uplot';
          if (id.includes('node_modules/dockview')) return 'vendor-dockview';
          if (id.includes('node_modules/react')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
