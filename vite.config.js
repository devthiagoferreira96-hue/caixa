import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', // funciona no GitHub Pages (subpasta) e em qualquer hospedagem
  plugins: [tailwindcss()],
});
