import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', 'shop/', 'about/', 'lookbook/', 'faq/'].map(path => `<url><loc>https://corbincombs.com/afterglowvintage-original/${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
