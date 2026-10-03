import {defineConfig} from 'vite';
export default defineConfig({plugins:[{name:'canonical-social-url',transformIndexHtml(html){const base=process.env.SITE_URL||process.env.URL;return base?html.replace('content="/images/cover.jpg"',`content="${base.replace(/\/$/,'')}/images/cover.jpg"`):html}}],build:{chunkSizeWarningLimit:600}});
