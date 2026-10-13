import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/target/**', '**/*.exe', '**/*.dll']
    }
  },
  build: {
    outDir: 'src-tauri/dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
