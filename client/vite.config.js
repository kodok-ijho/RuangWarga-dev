import { defineConfig, loadEnv } from 'vite';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import {
  buildN8nProxyHeaders,
  buildN8nTargetPath,
  resolveN8nProxyConfig,
} from './uatProxyConfig.js';
import { loadUatBrowserEnv } from './uatEnvLoader.js';

const clientRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isUat = mode === 'uat';
  const clientEnv = isUat
    ? loadUatBrowserEnv(path.resolve(clientRoot, 'uat.env'))
    : loadEnv(mode, clientRoot, '');
  const serverEnv = loadEnv(
    isUat ? 'uat.server' : 'server',
    path.resolve(clientRoot, '..'),
    ''
  );
  const env = isUat
    ? { ...serverEnv, ...process.env, ...clientEnv }
    : { ...clientEnv, ...serverEnv, ...process.env };
  const proxyConfig = resolveN8nProxyConfig({ mode, env });
  const uatBrowserDefines = Object.fromEntries(
    Object.entries(clientEnv).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ])
  );

  function n8nProxyPlugin() {
    function forwardToN8n(targetUrl, { method, headers, body }) {
      return new Promise((resolve, reject) => {
        const url = new URL(targetUrl);
        const req = https.request({
          method,
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          protocol: url.protocol,
          ...(proxyConfig.basicAuth ? { auth: proxyConfig.basicAuth } : {}),
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body || ''),
          },
        }, (upstream) => {
          const chunks = [];
          upstream.on('data', (chunk) => chunks.push(chunk));
          upstream.on('end', () => resolve({
            status: upstream.statusCode || 502,
            contentType: upstream.headers['content-type'] || 'application/json; charset=utf-8',
            text: Buffer.concat(chunks).toString('utf8'),
          }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
      });
    }

    return {
      name: 'pv-n8n-dev-proxy',
      configureServer(server) {
        if (!proxyConfig.enabled) return;
        server.middlewares.use('/api/n8n', async (req, res) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString('utf8');

          try {
            const targetPath = buildN8nTargetPath(proxyConfig.namespace, req.url || '/');
            const headers = buildN8nProxyHeaders(req.headers, proxyConfig);
            const upstream = await forwardToN8n(`${proxyConfig.targetBase}${targetPath}`, {
              method: req.method,
              headers,
              body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
            });
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', upstream.contentType);
            res.setHeader('Cache-Control', 'no-store');
            res.end(upstream.text);
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              ok: false,
              data: null,
              error: {
                code: 'N8N_PROXY_ERROR',
                message: 'Proxy API n8n gagal menghubungi backend.',
                details: { message: error?.message || String(error) },
              },
              meta: { timestamp: new Date().toISOString() },
            }));
          }
        });
      },
    };
  }

  return {
  // UAT disables Vite's automatic .env loading and injects only the allowlisted
  // browser values read from protected client/uat.env. Other modes keep .env.
  envDir: isUat ? false : clientRoot,
  envPrefix: isUat ? 'UAT_BROWSER_ENV_DISABLED_' : 'VITE_',
  define: isUat ? uatBrowserDefines : undefined,
  plugins: [
    react(),
    n8nProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // Service worker mati saat dev → hot-reload tetap mulus
      devOptions: {
        enabled: false,
      },

      workbox: {
        // Semua aset statis (JS, CSS, fonts) di-precache
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Kalau ada update, cek saat navigasi
        navigateFallback: 'index.html',
      },

      manifest: {
        name: 'Portal Warga Perumahan Palm Village',
        short_name: 'Portal Palm Village',
        description:
          'Portal resmi warga Perumahan Palm Village — pembayaran IPL, informasi penghuni, acara komunitas, dan forum diskusi.',
        theme_color: '#1a3d2e',
        background_color: '#1a3d2e',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: proxyConfig.isUat ? '127.0.0.1' : undefined,
    open: !proxyConfig.isUat,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-charts': ['recharts'],
          'vendor-icons': ['react-icons'],
          'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js', 'papaparse'],
          'vendor-core': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['tests/**', 'node_modules/**', 'dist/**'],
  },
  };
});
