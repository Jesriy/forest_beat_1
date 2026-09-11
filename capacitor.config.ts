import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 打包配置：把纯静态 dist/ 包进原生 App，完全本地运行、无需网络。
 * 首次打包 Android：
 *   npm run build
 *   npx cap add android      （仅第一次，生成 android/ 工程，需 Android Studio）
 *   npx cap sync             （每次更新 dist 后执行）
 *   npx cap open android     （在 Android Studio 里 Build APK）
 */
const config: CapacitorConfig = {
  appId: 'com.forestbeat.game',
  appName: 'Forest Beat',
  webDir: 'dist',
};

export default config;
