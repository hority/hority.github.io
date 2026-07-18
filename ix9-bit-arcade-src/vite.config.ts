import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ix9-bit-arcade/',
  plugins: [
    react(),
    wasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png', 'roms/*.nes'],
      manifest: {
        name: 'IX9 BIT ARCADE',
        short_name: 'BIT ARCADE',
        description: 'WASM × WebGL2で動く、自作NESホームブリュー・アーケード。',
        theme_color: '#080d11',
        background_color: '#080d11',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/ix9-bit-arcade/',
        scope: '/ix9-bit-arcade/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,nes,png,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true },
    }),
  ],
  build: {
    outDir: '../ix9-bit-arcade',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ['nes_rust_wasm'],
  },
});
