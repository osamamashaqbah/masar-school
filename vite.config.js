import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Firestore عندها آلية Offline خاصة فيها (persistent local cache) — ما منحط أي
      // runtimeCaching على طلباتها هون، لأنه Workbox ما إله دخل بمنطق المزامنة/الطابور تبعها
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'مسار — منصة مدرسية',
        short_name: 'مسار',
        description: 'منصة إدارة مدرسية متكاملة: جدول، حضور، درجات، واجبات وأكثر',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f0f12',
        theme_color: '#E8873A',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // كاش لملفات البناء (JS/CSS/الأيقونات) بس — أي طلب عابر للأصل (Firestore، خطوط Google،
        // Tabler icons) ما بينكاش تلقائيًا إلا لو ضفناه صراحة بـ runtimeCaching تحت
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tabler\/icons-webfont/,
            handler: 'CacheFirst',
            options: { cacheName: 'tabler-icons', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
