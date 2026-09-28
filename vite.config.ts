import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const contentSecurityPolicy = "default-src 'self'; connect-src 'none'; worker-src 'self' blob:; img-src 'self' blob: data:";

export default defineConfig({
  plugins: [react()],
  preview: {
    headers: { 'Content-Security-Policy': contentSecurityPolicy },
  },
});
