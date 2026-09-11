/**
 * config.js —— 全局可调参数 & 资源路径配置
 * ---------------------------------------------------------------
 * 本项目是纯静态站点（vite.config.js 中 base: './'），可部署到任意
 * 子目录 / 公网静态托管 / Capacitor 本地 file 环境，不依赖任何服务器。
 *
 * 替换素材的两种方式：
 *   A)（推荐，无需改代码）直接把文件放到 public/ 下对应路径，重新 build：
 *        public/assets/models/forest.glb 等
 *   B) 修改下方 ASSETS 中的相对路径。
 *
 * 注意：路径一律写「相对路径」（不带前导 / ），由 assetUrl() 统一结合
 * import.meta.env.BASE_URL 解析，根目录、GitHub Pages 子目录、离线 SW、
 * Capacitor webview 下都能正确命中。
 *
 * 谱面不走网络请求：src/charts/level1.json、level2.json 在构建时直接打包
 * 进 JS bundle（见 main.js 顶部 import），因此断网也能读取。
 */

/* 部署基路径：vite.config.js 中 base:'./'，这里得到 './'；若改成 '/repo/' 也兼容 */
export const BASE_URL = import.meta.env.BASE_URL;

/**
 * 把相对资源路径解析成当前部署位置下的绝对 URL。
 * @param {string} rel 如 'assets/audio/hit.mp3'
 */
export function assetUrl(rel) {
  return new URL(`${BASE_URL}${rel}`, window.location.href).href;
}

/* 资源路径（模型 / 音频的替换入口；谱面见 src/charts/*.json） */
export const ASSETS = {
  models: {
    forest: 'assets/models/forest.glb', // 树林（Blender 请先 File → Export → glTF 2.0 .glb）
    city: 'assets/models/city.glb',     // 高楼大厦
    mix: 'assets/models/mix.glb',       // 树林与高楼交织
  },
  audio: {
    level1: 'assets/audio/level1.mp3',  // 第 1 关 BGM
    level2: 'assets/audio/level2.mp3',  // 第 2 关 BGM
    hit: 'assets/audio/hit.mp3',        // 命中音效
    miss: 'assets/audio/miss.mp3',      // 失误音效
    clear: 'assets/audio/clear.mp3',    // 过关音效
  },
};

/* localStorage 键名 */
export const STORAGE_KEY = 'forest-beat-save-v1';

/* 轨道 */
export const LANE_COUNT = 4;
export const LANE_KEYS = ['d', 'f', 'j', 'k']; // 对应轨道 0~3
export const LANE_KEYS_ALT = ['D', 'F', 'J', 'K'];

/* 判定线位置（距屏幕顶部的高度比例） */
export const JUDGE_LINE_RATIO = 0.85;

/* 方块颜色 */
export const NOTE_COLORS = {
  green: '#3ddc84',
  gray: '#8a8f98',
};
export const JUDGE_TEXT_COLORS = {
  perfect: '#7dffce',
  good: '#9be7ff',
  ok: '#ffe9a3',
  miss: '#ff6f68',
};

/**
 * 方块尺寸（宽度占轨道宽度比例 / 高度 px）
 * 大块=低频鼓点，中块=中频旋律，小块=高频装饰
 */
export const NOTE_SIZES = {
  large:  { wRatio: 0.94, h: 120 },
  medium: { wRatio: 0.76, h: 78  },
  small:  { wRatio: 0.60, h: 48  },
};

/* 基础判定窗口（毫秒），第 1 关会乘上更宽松的系数 */
export const JUDGE_WINDOWS_MS = {
  perfect: 45,
  good: 90,
  ok: 135,
  // 超过 ok 窗口即 Miss（需求中的“过线后 150ms 未点击”）
};

/* 计分 */
export const SCORE = {
  perfect: 100,
  good: 60,
  ok: 30,
  miss: -30,
  comboStep: 10,      // 每 10 连击
  comboBonus: 0.10,   // 增加 10% 分数加成
  comboBonusCap: 0.5, // 最多 +50%，避免目标分失真
};

/**
 * 关卡参数
 * - targetRatio：过关所需分数 / 总可得分(音符数×100)
 * - fallBeatFactor：fallTime = beatDuration × 该系数
 * - judgeScale：判定窗口宽松系数（越大越宽松）
 * 谱面 JSON 内的 bpm / offset / fallTime / targetRatio 若存在则优先生效，
 * 这里的值作为默认值与兜底。
 */
export const LEVELS = {
  1: {
    name: '苏醒的森林',
    bpm: 100,
    offset: 0,
    fallBeatFactor: 2.0,
    targetRatio: 0.6,
    judgeScale: 1.25,
  },
  2: {
    name: '林城交响',
    bpm: 128,
    offset: 0,
    fallBeatFactor: 1.5,
    targetRatio: 0.7,
    judgeScale: 1.0,
  },
};

/* 首页主题 */
export const THEMES = {
  FOREST: 'forest', // 初始：树林 + 阳光
  CITY: 'city',     // 通关 1：高楼 + 灰暗
  MIX: 'mix',       // 通关 2：林城交织 + 蓝天白云
};

/* 3D 场景参数 */
export const SCENE = {
  modelTargetSize: 9,   // 模型归一化后的最大边长
  rotateSpeed: 0.18,    // 展示自转速度 弧度/秒
  fadeDuration: 1.0,    // 主题淡入淡出秒数
  cameraHeight: 4.2,
  cameraDistance: 15,
  fov: 50,
};

/* 音频相关 */
export const AUDIO = {
  defaultBgmVolume: 0.8,
  defaultSfxVolume: 0.9,
  sampleRate: 44100,
};
