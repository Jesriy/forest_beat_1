/**
 * main.js —— 应用入口与状态编排
 * 首页 ⇄ 关卡加载/倒计时 ⇄ 游戏 ⇄ 结算
 */
import { ASSETS } from './config.js';
import { loadSave, updateSave, resetSave, markLevelCleared } from './storage.js';
import { AudioEngine } from './audioEngine.js';
import { HomeScene } from './homeScene.js';
import { GameScene } from './gameScene.js';
import { createUI } from './ui.js';
// 谱面在构建时直接打包进 bundle（无网络请求，断网可用）。
// 想换谱面：用 analyzer.html 生成 JSON 后替换 src/charts/ 下文件，重新 build。
import chartLevel1 from './charts/level1.json';
import chartLevel2 from './charts/level2.json';

const CHARTS = { 1: chartLevel1, 2: chartLevel2 };

const ui = createUI();
const audio = new AudioEngine();

let save = loadSave();
audio.setVolumes(save.volume);
ui.syncSettings(save);
ui.renderHome(save);

/* ---------------- 首页 3D 场景 ---------------- */
const homeScene = new HomeScene(document.getElementById('three-canvas'), {
  onLoading: ui.modelLoading,
  onNotice: ui.modelNotice,
});
homeScene.setTheme(save.theme);

/* ---------------- 全局状态 ---------------- */
/** @type {GameScene|null} */
let game = null;
let currentLevel = null;
let running = false; // 防止关卡流程重入

const gameCanvas = document.getElementById('game-canvas');
gameCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- 资源失败：只提示“资源加载失败，请重试”，不提服务器 ---------------- */
ui.els.btnAssetRetry.addEventListener('click', () => {
  // 普通刷新即可：已缓存的资源由 Service Worker 离线提供，缺失资源重新拉取
  window.location.reload();
});
// 静态资源（脚本/样式）加载失败，通常是网络中断或部署不完整
window.addEventListener('error', (e) => {
  const target = e.target;
  if (target && target !== window && /^(SCRIPT|LINK|SOURCE)$/.test(target.tagName)) {
    ui.fatalError('部分游戏资源加载失败，请检查网络后点击“重试”。\n（已缓存的内容仍可离线使用）');
  }
}, true);

/* ---------------- 关卡流程 ---------------- */
async function startLevel(level) {
  if (running) return;
  running = true;
  currentLevel = level;

  destroyGame();
  ui.showScreen('game');
  ui.showPause(false);
  ui.resetHud();
  ui.setCountdown('加载中…');

  try {
    ui.fatalError(null, false);
    // 必须在用户手势链路里 resume 音频上下文（满足浏览器自动播放策略）
    await audio.ensure();
    const chart = CHARTS[level];
    const { usingSynthBgm } = await audio.loadLevel(level, chart);
    if (usingSynthBgm) {
      ui.modelNotice(`未找到 ${ASSETS.audio[`level${level}`]}，正在使用合成节拍占位，放入 mp3 后自动替换。`);
    }

    await runCountdown(['3', '2', '1']);
    ui.setCountdown(null);

    game = new GameScene(gameCanvas, chart, level, audio, {
      onHud: ui.setHud,
      onPauseToggle: togglePause,
      onFinish: handleFinish,
    });
    audio.startBgm();
    game.start();
  } catch (err) {
    console.error(err);
    // 不使用 toast 一闪而过：关卡核心资源失败时给出可重试遮罩
    ui.fatalError('关卡资源加载失败，请点击“重试”。\n如果刚刚更新过版本，重试后即会加载最新文件。');
    ui.showScreen('game');
  } finally {
    running = false;
  }
}

function runCountdown(texts) {
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      if (i >= texts.length) { resolve(); return; }
      ui.setCountdown(texts[i++]);
      setTimeout(step, 700);
    };
    step();
  });
}

function destroyGame() {
  if (game) {
    game.destroy();
    game = null;
  }
  audio.stopBgm();
}

function goHome() {
  destroyGame();
  ui.showPause(false);
  ui.setCountdown(null);
  ui.showScreen('home');
  ui.renderHome(save);
  homeScene.setTheme(save.theme);
}

/* ---------------- 暂停 / 继续 / 重开 ---------------- */
async function togglePause() {
  if (!game) return;
  if (game.state === 'playing') {
    game.pause();
    await audio.pause();
    ui.showPause(true);
  } else if (game.state === 'paused') {
    await audio.resume();
    game.resume();
    ui.showPause(false);
  }
}

/* ---------------- 结算 ---------------- */
function handleFinish(result) {
  destroyGame();
  if (result.passed) {
    save = markLevelCleared(save, currentLevel, result);
    // 通关音效（第 2 关同样播放）
    setTimeout(() => audio.playSfx('clear'), 60);
  }
  ui.renderResult(currentLevel, result, save);
  ui.showScreen('result');
}

/* ---------------- 首页事件 ---------------- */
ui.els.btnStart.addEventListener('click', () => {
  ui.toggleLevelPanel();
});

ui.els.levelBtns.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    const level = idx + 1;
    if (save.unlockedLevel < level) {
      ui.toast('请先完成关卡 1');
      return;
    }
    startLevel(level);
  });
});

/* 重置进度 */
ui.els.btnReset.addEventListener('click', () => {
  const ok = window.confirm('确定要清空全部通关进度与设置吗？');
  if (!ok) return;
  save = resetSave();
  audio.setVolumes(save.volume);
  ui.syncSettings(save);
  ui.renderHome(save);
  homeScene.setTheme('forest');
  ui.toast('进度已重置');
});

/* ---------------- 设置 ---------------- */
ui.els.btnSettings.addEventListener('click', () => ui.showSettings(true));
ui.els.btnSettingsClose.addEventListener('click', () => ui.showSettings(false));

ui.els.bgmVolume.addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  ui.els.bgmVolumeVal.textContent = e.target.value;
  save = updateSave({ volume: { ...save.volume, bgm: v } });
  audio.setVolumes({ bgm: v });
});
ui.els.sfxVolume.addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  ui.els.sfxVolumeVal.textContent = e.target.value;
  save = updateSave({ volume: { ...save.volume, sfx: v } });
  audio.setVolumes({ sfx: v });
});

/* ---------------- 游戏页按钮 ---------------- */
ui.els.btnPause.addEventListener('click', togglePause);
ui.els.btnResume.addEventListener('click', togglePause);
ui.els.btnQuit.addEventListener('click', goHome);
ui.els.btnExit.addEventListener('click', goHome);

ui.els.btnRetryPause.addEventListener('click', async () => {
  if (!game) return;
  ui.showPause(false);
  await audio.resume();
  game.restart();
});

/* ---------------- 结算页按钮 ---------------- */
ui.els.btnResultRetry.addEventListener('click', () => startLevel(currentLevel));
ui.els.btnResultHome.addEventListener('click', goHome);
ui.els.btnResultNext.addEventListener('click', () => {
  if (save.unlockedLevel >= 2) startLevel(2);
});
