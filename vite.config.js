import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    // /api plus MCP-servern och dess OAuth-vägar (så att Claude kan testas mot utvecklingsservern).
    proxy: Object.fromEntries(['/api', '/mcp', '/authorize', '/token', '/register', '/revoke', '/.well-known'].map((p) => [p, { target: `http://localhost:${process.env.API_PORT || 4000}`, changeOrigin: false }])),
  },
});
