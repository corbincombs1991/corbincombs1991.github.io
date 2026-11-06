import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://corbincombs.com',
  base: '/afterglowvintage-original',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', assets: 'assets' },
});
