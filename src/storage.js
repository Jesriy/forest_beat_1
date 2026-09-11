/**
 * storage.js —— localStorage 进度 / 设置读写
 * 保存结构：
 * {
 *   level1Cleared, level2Cleared: boolean,
 *   unlockedLevel: 1 | 2,
 *   theme: 'forest' | 'city' | 'mix',
 *   volume: { bgm: 0~1, sfx: 0~1 },
 *   best: { 1: {score, acc}, 2: {...} }  // 可选：最佳成绩
 * }
 */
import { STORAGE_KEY, AUDIO } from './config.js';

/** 默认存档 */
export function defaultSave() {
  return {
    level1Cleared: false,
    level2Cleared: false,
    unlockedLevel: 1,
    theme: 'forest',
    volume: {
      bgm: AUDIO.defaultBgmVolume,
      sfx: AUDIO.defaultSfxVolume,
    },
    best: { 1: null, 2: null },
  };
}

/** 读取存档（字段缺失时补全） */
export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      ...base,
      ...data,
      volume: { ...base.volume, ...(data.volume || {}) },
      best: { ...base.best, ...(data.best || {}) },
    };
  } catch (err) {
    console.warn('[storage] 存档解析失败，使用默认存档：', err);
    return base;
  }
}

/** 直接写入整个存档 */
export function writeSave(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn('[storage] 写入失败：', err);
  }
  return save;
}

/** 局部更新并持久化 */
export function updateSave(patch) {
  const next = { ...loadSave(), ...patch };
  writeSave(next);
  return next;
}

/** 关卡通关：更新通关标记、解锁下一关注册主题 */
export function markLevelCleared(save, level, result) {
  const next = structuredCloneSafe(save);
  if (level === 1) {
    next.level1Cleared = true;
    next.unlockedLevel = Math.max(next.unlockedLevel, 2);
    next.theme = next.level2Cleared ? 'mix' : 'city';
  } else if (level === 2) {
    next.level2Cleared = true;
    next.theme = 'mix';
  }
  // 记录最佳
  const prev = next.best?.[level];
  if (!prev || result.score > prev.score) {
    next.best[level] = { score: result.score, acc: result.accuracy };
  }
  writeSave(next);
  return next;
}

/** 重置全部进度（保留/重置音量都重置为默认） */
export function resetSave() {
  const fresh = defaultSave();
  writeSave(fresh);
  return fresh;
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
