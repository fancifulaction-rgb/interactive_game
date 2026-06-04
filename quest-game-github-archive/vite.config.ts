import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// const isProd = process.env.BUILD_MODE === 'prod'
export default defineConfig({
  plugins: [
    react()
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

