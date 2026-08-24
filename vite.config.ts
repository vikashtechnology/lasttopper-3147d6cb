import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: [".e2b.app"],
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    ...(command === "build" ? [nitro({ defaultPreset: "node" })] : []),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      outDir: process.env.VERCEL ? ".vercel/output/static" : ".output/public",
      filename: "pwa-sw.js",
      devOptions: { enabled: false },
      includeAssets: ["app-icon-512.png"],
      manifest: false,
      workbox: {
        navigateFallback: "/",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html-nav", networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\/assets\/.+\.(?:js|css|woff2|png|svg)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "static-assets" },
          },
        ],
      },
    }),
  ],
}));
