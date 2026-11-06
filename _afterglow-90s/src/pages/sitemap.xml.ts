import type { APIRoute } from 'astro';
import { url } from '../lib/urls';
export const GET: APIRoute = () => new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['','shop/','about/','lookbook/','faq/','guestbook/'].map(path=>`<url><loc>https://corbincombs.com${url(path)}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml'}});
