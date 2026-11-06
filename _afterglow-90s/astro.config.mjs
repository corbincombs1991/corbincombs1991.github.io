import { defineConfig } from 'astro/config';
export default defineConfig({ site: 'https://corbincombs.com', base: '/afterglowvintage-90s', output: 'static', trailingSlash: 'always', build: { format: 'directory', assets: 'assets' } });
