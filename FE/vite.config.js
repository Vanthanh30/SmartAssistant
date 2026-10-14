import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
// Keep local browser origin consistent with API CORS and session cookies.
function canonicalLocalOrigin() {
  const middleware = (req, res, next) => {
    const host = req.headers.host ?? '';
    if (/^127\.0\.0\.1:\d+$/.test(host) && req.headers.accept?.includes('text/html')) {
      res.writeHead(302, { Location: `http://${host.replace('127.0.0.1', 'localhost')}${req.url}`, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    next();
  };
  return { name: 'canonical-local-origin', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
export default defineConfig({ plugins: [react(), canonicalLocalOrigin()], cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite', server: { port: 5173, strictPort: true,
  fs: { strict: true, allow: [fileURLToPath(new URL('./', import.meta.url)), fileURLToPath(new URL('../docs/design-tokens.css', import.meta.url))] } } });
