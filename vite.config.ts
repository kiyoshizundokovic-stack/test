/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** アプリの色（public/icons と index.html の theme-color と同じ） */
const THEME_COLOR = '#14532d';
const BACKGROUND_COLOR = '#f6f7f9';

export default defineConfig({
  // GitHub Pages（プロジェクトページ：/リポジトリ名/）でも動くよう相対パスで出力する
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 新しい版を配信したら自動で更新する（状態は変わるたびに保存しているので、再読み込みしても続きから遊べる）
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '野球ローグライク',
        short_name: '野球ローグ',
        description: '選手を育てて100戦を戦い抜く、野球チーム編成型のローグライク',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // オフラインでも遊べるよう、アプリ一式を事前にキャッシュする
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
