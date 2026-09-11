import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// 纯前端静态站点：build 产物全部在 dist/，可部署到任意静态托管 / GitHub Pages 子目录 / Capacitor。
export default defineConfig({
  // 相对路径打包：部署到根域名或子目录（如 /forest/）都能正确加载资源
  base: './',

  // 本地开发配置（仅 npm run dev 时使用，与线上部署无关）
  server: {
    host: true,   // 同时接受 localhost 与局域网 IP，方便手机联调
    port: 5173,
    strictPort: true,
    open: true,   // 启动后自动打开浏览器
  },
  preview: {
    host: true,
    port: 4173,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        analyzer: resolve(__dirname, 'analyzer.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },

  plugins: [
    VitePWA({
      // 新版本就绪后自动接管，无需用户手动刷新
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Forest Beat · 林与城的音游',
        short_name: 'Forest Beat',
        description: '林与城的节奏之旅：四轨下落式网页音游，可离线游玩。',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#101b14',
        background_color: '#0e1a13',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 预缓存所有应用壳 + 用户素材（模型可能很大，调高单文件上限到 100MB）
        globPatterns: [
          '**/*.{html,js,css,json,png,jpg,jpeg,svg,ico,webp,gif,woff,woff2,ttf,glb,gltf,mp3,ogg,wav,m4a,wasm}',
        ],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // 多页面应用：analyzer.html 本身已预缓存，直接命中；其他导航回退到首页
        navigateFallback: 'index.html',
        // 运行时缓存：构建后才加入 / 超过预缓存范围的音视频与模型，首次在线加载后即离线可用
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\.(?:glb|gltf|mp3|ogg|wav|m4a|aac|png|jpg|jpeg|webp)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'forest-media',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
