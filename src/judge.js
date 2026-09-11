/**
 * judge.js —— 音游判定纯函数（无 DOM / 无音频依赖，便于测试与复用）
 * ---------------------------------------------------------------
 * Perfect ±45ms / Good ±90ms / OK ±135ms（第 1 关由 judgeScale 放宽）。
 */
import { JUDGE_WINDOWS_MS, SCORE } from './config.js';

/**
 * 计算某一关的实际判定窗口（毫秒）
 * @param {number} judgeScale 关卡宽松系数
 */
export function getWindows(judgeScale = 1) {
  const s = judgeScale;
  return {
    perfect: JUDGE_WINDOWS_MS.perfect * s,
    good: JUDGE_WINDOWS_MS.good * s,
    ok: JUDGE_WINDOWS_MS.ok * s,
  };
}

/**
 * 根据时间差给出判定等级
 * @param {number} deltaMs 点击时刻 - 音符时刻（毫秒，可正可负）
 * @param {{perfect:number,good:number,ok:number}} win 判定窗口
 * @returns {'perfect'|'good'|'ok'|'none'|'miss'}
 *   none = 距离还太远，这次点击不算；miss = 已过判定窗口
 */
export function judgeTiming(deltaMs, win) {
  const abs = Math.abs(deltaMs);
  if (abs <= win.perfect) return 'perfect';
  if (abs <= win.good) return 'good';
  if (abs <= win.ok) return 'ok';
  return deltaMs > win.ok ? 'miss' : 'none';
}

/**
 * 在某轨道中找到“当前最应该被判定”的未判定音符：
 * 距离判定线最近，且仍在 OK 窗口内。
 * @returns 音符对象或 null
 */
export function findJudgableNote(notes, lane, timeSec, win) {
  const winSec = win.ok / 1000;
  let best = null;
  let bestAbs = Infinity;
  for (const n of notes) {
    if (n.judged || n.lane !== lane) continue;
    const delta = timeSec - n.time;
    if (delta < -winSec) continue; // 还没到窗口
    if (delta > winSec) continue;  // 已过窗口（应由自动 Miss 处理）
    const abs = Math.abs(delta);
    if (abs < bestAbs) {
      bestAbs = abs;
      best = n;
    }
  }
  return best;
}

/**
 * 连击加成倍率：每 10 连击 +10%，上限 comboBonusCap
 */
export function comboMultiplier(combo) {
  const steps = Math.floor(combo / SCORE.comboStep);
  return 1 + Math.min(steps * SCORE.comboBonus, SCORE.comboBonusCap);
}

/** 一次命中的实际得分（含连击加成，四舍五入） */
export function hitScore(judgement, combo) {
  const base = SCORE[judgement] || 0;
  if (base <= 0) return base;
  return Math.round(base * comboMultiplier(combo));
}

/** 新建一局的统计对象 */
export function createStats(noteCount) {
  return {
    noteCount,
    perfect: 0,
    good: 0,
    ok: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    score: 0,
  };
}

/** 已产生判定的音符数 */
export function judgedCount(stats) {
  return stats.perfect + stats.good + stats.ok + stats.miss;
}

/**
 * 准确率：按 Perfect=100% / Good=60% / OK=30% / Miss=0 加权，
 * 分母为已判定音符数（开局显示 100%）。
 */
export function accuracy(stats) {
  const judged = judgedCount(stats);
  if (judged === 0) return 1;
  const weighted = stats.perfect * 100 + stats.good * 60 + stats.ok * 30;
  return weighted / (judged * 100);
}

/** 总可得分 = 音符数 × 100 */
export function totalPossible(noteCount) {
  return noteCount * 100;
}

/** 过关目标分 */
export function targetScore(noteCount, targetRatio) {
  return Math.round(totalPossible(noteCount) * targetRatio);
}
