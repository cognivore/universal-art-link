import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 4321,
    host: '0.0.0.0'
  },
  preview: {
    port: 4321
  }
});

