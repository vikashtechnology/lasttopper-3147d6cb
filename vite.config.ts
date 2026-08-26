import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
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
    ...(command === "build"
      ? [
          nitro({
            defaultPreset: "node",
            // firebase-admin ships BOTH a CJS build (lib/*) and ESM wrappers
            // (lib/esm/*). Pre-bundling both into one chunk trips rolldown's
            // CJS interop: the ESM wrapper's default-import of the CJS module
            // becomes `namespace.default.X` reads where `.default` does not
            // exist on `__esModule` CJS exports -> the server function crashes
            // at module load ("Cannot read properties of undefined (reading
            // 'SDK_VERSION')"). Force every entry we import onto the CJS
            // build (absolute paths bypass the package `exports` map) so only
            // one consistent build is bundled.
            alias: {
              "firebase-admin/app": fileURLToPath(
                new URL("./node_modules/firebase-admin/lib/app/index.js", import.meta.url),
              ),
              "firebase-admin/auth": fileURLToPath(
                new URL("./node_modules/firebase-admin/lib/auth/index.js", import.meta.url),
              ),
              "firebase-admin/firestore": fileURLToPath(
                new URL("./node_modules/firebase-admin/lib/firestore/index.js", import.meta.url),
              ),
            },
            // Deploy as a Vercel lambda. The bundler leaves a handful of CJS
            // packages as bare runtime require("...") calls inside the built
            // `_ssr` chunks (see scripts/embed-function-deps.mjs) that the
            // nf3 dep-tracer cannot follow -> "Cannot find module
            // 'google-auth-library'" in /var/task. scripts/embed-function-deps.mjs
            // (wired as `postbuild`) copies those packages + their closure into
            // the output's node_modules, which is then uploaded by
            // `vercel deploy --prebuilt`.
          }),
        ]
      : []),
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
