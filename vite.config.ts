/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages（プロジェクトページ）配信を想定して相対パスで出力する
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
