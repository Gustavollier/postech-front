import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O GitHub Pages serve o site em /<repositorio>/, entao o base precisa bater com
// o nome do repositorio ou todos os assets quebram com 404 em producao.
//
// VITE_BASE permite publicar o mesmo build na raiz de outro host (Netlify, por
// exemplo), onde o prefixo do repositorio nao existe.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/postech-front/',
  build: { outDir: 'dist', sourcemap: false },
});
