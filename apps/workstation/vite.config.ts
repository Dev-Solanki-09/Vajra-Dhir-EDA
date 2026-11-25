import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:41900',
        ws: true,
      },
      '/stitch': 'http://127.0.0.1:41900',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('packages/kicanvas-core') || id.includes('@vajradhir/kicanvas-core')) return 'vendor-kicanvas';
          if (id.includes('node_modules/elkjs')) return 'vendor-elk';
          if (id.includes('node_modules/uplot')) return 'vendor-uplot';
          if (id.includes('node_modules/yjs') || id.includes('node_modules/lib0')) return 'vendor-yjs';
          if (id.includes('node_modules/dockview')) return 'vendor-dockview';
          if (id.includes('node_modules/react')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
