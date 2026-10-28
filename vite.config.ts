import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({ server: { entry: 'server' } }),
    nitro({ defaultPreset: 'cloudflare-module' }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: { host: '::', port: 8080 },
});
