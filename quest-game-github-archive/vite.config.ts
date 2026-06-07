import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { clientLogsFilePlugin } from "./vite-client-logs-plugin"

// const isProd = process.env.BUILD_MODE === 'prod'
const DEBUG_INGEST_PATH = "/ingest/7fb5ad31-3ebd-4437-b10a-7b29790fa840"

export default defineConfig({
  server: {
    host: true,
    proxy: {
      "/__debug_ingest": {
        target: "http://127.0.0.1:7862",
        changeOrigin: true,
        rewrite: () => DEBUG_INGEST_PATH,
      },
    },
  },
  plugins: [
    clientLogsFilePlugin(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "vite.svg"],
      manifest: {
        name: "Quest Game",
        short_name: "Квест",
        description: "Командные квесты на мероприятиях",
        start_url: "/",
        display: "standalone",
        background_color: "#8b5cf6",
        theme_color: "#8b5cf6",
        lang: "ru",
        icons: [
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'core-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui-dialog': ['@radix-ui/react-dialog', '@radix-ui/react-toast'],
          'vendor-ui-form': [
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs'
          ],
          'vendor-form': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod'
          ],
          'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge', 'lucide-react'],
          // Тяжелые библиотеки экспорта убраны из основного бандла и загружаются динамически
          'vendor-charts': ['recharts']
        }
      }
    },
    chunkSizeWarningLimit: 200
  }
})

