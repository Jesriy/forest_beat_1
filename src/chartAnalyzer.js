/**
 * chartAnalyzer.js —— 音乐分析 & 谱面生成
 * ---------------------------------------------------------------
 * 两部分能力：
 *
 * 1. analyzeAudioBuffer(buffer, level, options)
 *    用纯 JS 信号处理分析 AudioBuffer：
 *      - 一阶低通分离低 / 中 / 高频能量
 *      - spectral flux 风格的 onset（起音）检测
 *      - 低频能量自相关检测 BPM 与相位
 *      - 音符对齐 1/4、1/8（第 2 关含 1/16）拍网格，最小间隔 80ms
 *      - 低频强→大块，中频→中块，高频→小块
 *      - 重拍绿色大块 / 弱拍灰色小块，绿灰交织
 *
 * 2. generateDefaultChart(level)
 *    没有真实音乐文件时的确定性占位谱面（与 audioEngine 的合成 BGM 同 BPM）。
 *    public/assets/charts/level1.json、level2.json 即由它生成。
 */

/* ==================== 占位谱面（确定性） ==================== */

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 轨道分配器：尽量分散、避免同轨过近（jack） */
function makeLaneAllocator(seed, minSameLaneGap = 0.14) {
  const rng = makeRng(seed);
  const last = [-9, -9, -9, -9];
  let prevLane = -1;

  return function alloc(time) {
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
    // 优先选与上一个不同、且本轨空闲够久的轨道
    for (const lane of order) {
      if (lane === prevLane) continue;
      if (time - last[lane] >= minSameLaneGap) {
        last[lane] = time;
        prevLane = lane;
        return lane;
      }
    }
    // 兜底：选最久没用的轨道
    let pick = 0;
    for (let i = 1; i < 4; i++) if (last[i] < last[pick]) pick = i;
    last[pick] = time;
    prevLane = pick;
    return pick;
  };
}

export function generateDefaultChart(level) {
  if (level === 2) return generateLevel2();
  return generateLevel1();
}

/* 第 1 关：100 BPM，24 小节，方块偏大 / 速度 2 拍 / 判定宽松（由 config 控制） */
function generateLevel1() {
  const bpm = 100;
  const beat = 60 / bpm;
  const bars = 24;
  const alloc = makeLaneAllocator(1101);
  const notes = [];
  const add = (beatPos, size, color) => {
    const time = +(beatPos * beat).toFixed(4);
    notes.push({ time, lane: alloc(time), size, color });
  };

  for (let bar = 0; bar < bars; bar++) {
    const b0 = 2 + bar * 4; // 预留 2 拍开场
    // 基础四拍：重拍绿色大块，其余中块绿灰交替
    add(b0, 'large', 'green');
    add(b0 + 1, 'medium', bar % 2 ? 'green' : 'gray');
    add(b0 + 2, 'medium', 'green');
    add(b0 + 3, 'medium', 'gray');
    // 偶数小节点缀两个八分小块（3.5 的绿色小块形成小过门）
    if (bar % 2 === 1) {
      add(b0 + 2.5, 'small', 'gray');
      add(b0 + 3.5, 'small', 'green');
    }
  }

  return finalizeChart({
    bpm, offset: 0, level: 1, fallBeatFactor: 2.0, targetRatio: 0.6,
    bars, notes,
  });
}

/* 第 2 关：128 BPM，32 小节，八分/十六分密集、灰绿交织、大小多变 */
function generateLevel2() {
  const bpm = 128;
  const beat = 60 / bpm;
  const bars = 32;
  const alloc = makeLaneAllocator(2202, 0.11);
  const notes = [];
  const used = new Set(); // 防止同一拍点重复
  const add = (beatPos, size, color) => {
    const key = beatPos.toFixed(3);
    if (used.has(key)) return;
    used.add(key);
    const time = +(beatPos * beat).toFixed(4);
    notes.push({ time, lane: alloc(time), size, color });
  };

  for (let bar = 0; bar < bars; bar++) {
    const b0 = 2 + bar * 4;
    const burst = bar % 4 === 3; // 每 4 小节一组十六分阶梯

    if (burst) {
      // 重拍 + 四连十六分 + 反拍
      add(b0, 'large', 'green');
      add(b0 + 1, 'medium', 'gray');
      add(b0 + 2, 'medium', 'green');
      for (let i = 0; i < 4; i++) {
        add(b0 + 2.5 + i * 0.25, 'small', i % 2 ? 'gray' : 'green');
      }
      add(b0 + 3.5, 'medium', 'gray');
      continue;
    }

    // 常规小节：八分网格，绿灰交织
    const grid = [
      [0.0, 'large', 'green'],
      [0.5, 'small', 'gray'],
      [1.0, 'medium', 'gray'],
      [1.5, 'small', 'green'],
      [2.0, 'medium', 'green'],
      [2.5, 'small', 'gray'],
      [3.0, 'large', bar % 2 ? 'green' : 'gray'],
      [3.5, 'small', bar % 2 ? 'gray' : 'green'],
    ];
    for (const [pos, size, color] of grid) add(b0 + pos, size, color);
  }

  return finalizeChart({
    bpm, offset: 0, level: 2, fallBeatFactor: 1.5, targetRatio: 0.7,
    bars, notes,
  });
}

function finalizeChart({ bpm, offset, level, fallBeatFactor, targetRatio, bars, notes }) {
  const beat = 60 / bpm;
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const duration = +((bars * 4 + 5) * beat).toFixed(3);
  return {
    bpm,
    offset,
    fallTime: +(fallBeatFactor * beat).toFixed(4),
    targetRatio,
    duration,
    notes,
  };
}

/* ==================== 真实音频分析 ==================== */

const FRAME = 1024;
const HOP = 512;

/** 多声道混合为单声道 Float32Array */
function toMono(buffer) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }
  return mono;
}

/** 一阶低通滤波；返回新数组 */
function lowpass(sig, sr, cutoff) {
  const dt = 1 / sr;
  const rc = 1 / (2 * Math.PI * cutoff);
  const a = dt / (rc + dt);
  const out = new Float32Array(sig.length);
  let y = 0;
  for (let i = 0; i < sig.length; i++) {
    y += a * (sig[i] - y);
    out[i] = y;
  }
  return out;
}

/**
 * 计算每帧的低/中/高频能量与 onset 强度
 * @returns {{frames:number, hopSec:number, times:number[], low:number[], mid:number[], high:number[], flux:number[]}}
 */
export function computeBandEnergy(mono, sr) {
  const low150 = lowpass(mono, sr, 150);
  const low2k = lowpass(mono, sr, 2000);
  const frames = Math.floor((mono.length - FRAME) / HOP);
  const hopSec = HOP / sr;

  const low = [], mid = [], high = [];
  for (let f = 0; f < frames; f++) {
    let eL = 0, eM = 0, eH = 0;
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      const x = mono[start + i];
      const l = low150[start + i];
      const m = low2k[start + i] - l;
      const h = x - low2k[start + i];
      eL += l * l; eM += m * m; eH += h * h;
    }
    low.push(eL / FRAME);
    mid.push(eM / FRAME);
    high.push(eH / FRAME);
  }

  // 自适应阈值的 spectral flux（能量正向差分）
  const flux = [];
  const win = 8; // ~93ms 局部平均
  const bandFlux = [[], [], []];
  const bands = [low, mid, high];
  for (let f = 0; f < frames; f++) {
    let total = 0;
    for (let b = 0; b < 3; b++) {
      const e = bands[b];
      let base = 0;
      let n = 0;
      for (let j = Math.max(0, f - win); j < f; j++) { base += e[j]; n++; }
      base = n ? base / n : e[f];
      const d = Math.max(0, e[f] - base * 1.3);
      bandFlux[b][f] = d;
      total += d * (b === 0 ? 1.6 : b === 1 ? 1.0 : 0.7);
    }
    flux.push(total);
  }

  const times = Array.from({ length: frames }, (_, f) => f * hopSec);
  return { frames, hopSec, times, low, mid, high, flux, bandFlux };
}

/**
 * BPM 检测：对低频 onset 曲线做自相关，在 60~180 BPM 内找峰
 * @returns {{bpm:number, phase:number, strength:number}}
 */
export function detectBpm(env, hopSec, bpmOverride = null) {
  if (bpmOverride) {
    // 仍估算相位
    const beat = 60 / bpmOverride;
    return { bpm: bpmOverride, phase: findPhase(env, hopSec, beat), strength: 1 };
  }
  let best = { bpm: 120, value: -Infinity, phase: 0 };
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = Math.round(beat_dur(bpm) / hopSec);
    if (lag < 2) continue;
    let sum = 0, norm = 0;
    for (let i = 0; i + lag < env.length; i++) {
      sum += env[i] * env[i + lag];
      norm += env[i] * env[i];
    }
    const val = norm > 0 ? sum / norm : 0;
    if (val > best.value) best = { bpm, value: val, phase: 0 };
  }
  best.phase = findPhase(env, hopSec, beat_dur(best.bpm));
  return best;
}
function beat_dur(bpm) { return 60 / bpm; }

function findPhase(env, hopSec, beat) {
  // 在一个 beat 内扫描相位，使节拍位置与 onset 能量对齐
  const lag = Math.round(beat / hopSec);
  let bestPhase = 0, bestVal = -Infinity;
  for (let p = 0; p < lag; p++) {
    let sum = 0, cnt = 0;
    for (let i = p; i < env.length; i += lag) {
      // 节拍点附近两帧能量
      sum += (env[i] || 0) + (env[i + 1] || 0) * 0.6;
      cnt++;
    }
    const val = cnt ? sum / cnt : 0;
    if (val > bestVal) { bestVal = val; bestPhase = p; }
  }
  return bestPhase * hopSec;
}

/** 在 flux 中找局部峰（最小间隔 minGapSec） */
function pickPeaks(flux, hopSec, minGapSec, sensitivity = 1) {
  const minGapFrames = Math.round(minGapSec / hopSec);
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const variance = flux.reduce((a, b) => a + (b - mean) ** 2, 0) / (flux.length || 1);
  const std = Math.sqrt(variance);
  const threshold = mean + 0.45 * std * sensitivity;

  const peaks = [];
  let cooldown = 0;
  for (let i = 2; i < flux.length - 2; i++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (flux[i] < threshold) continue;
    if (flux[i] >= flux[i - 1] && flux[i] >= flux[i - 2] &&
        flux[i] >= flux[i + 1] && flux[i] >= flux[i + 2]) {
      peaks.push({ frame: i, time: i * hopSec, strength: flux[i] });
      cooldown = minGapFrames;
    }
  }
  return peaks;
}

function clampLane(x) { return Math.max(0, Math.min(3, x | 0)); }

/**
 * 分析解码后的音频并生成谱面对象
 * @param {AudioBuffer} buffer
 * @param {1|2} level
 * @param {{bpm?:number, offset?:number, sensitivity?:number}} options
 */
export function analyzeAudioBuffer(buffer, level = 1, options = {}) {
  const sr = buffer.sampleRate;
  const mono = toMono(buffer);
  const { hopSec, low, mid, high, flux, bandFlux } = computeBandEnergy(mono, sr);

  const hard = level === 2;
  const { bpm, phase } = detectBpm(bandFlux[0], hopSec, options.bpm || null);
  const beat = 60 / bpm;
  const subdiv = 8;                 // 统一吸附到 1/8 网格
  const gridStep = beat / subdiv;

  // onset 峰：第 2 关允许更密（但仍 >= 80ms）
  const peaks = pickPeaks(flux, hopSec, hard ? 0.08 : 0.12, options.sensitivity || 1);

  // 把峰吸附到网格，同一格只保留最强的
  const slotMap = new Map();
  for (const pk of peaks) {
    if (pk.time < phase - gridStep) continue;
    let slot = Math.round((pk.time - phase) / gridStep);
    if (slot < 0) slot = 0;
    const t = phase + slot * gridStep;
    const cur = slotMap.get(slot);
    if (!cur || pk.strength > cur.strength) {
      slotMap.set(slot, { time: t, frame: pk.frame, strength: pk.strength, slot });
    }
  }

  const alloc = makeLaneAllocator(hard ? 7077 : 7071, hard ? 0.1 : 0.14);
  const notes = [];
  const totalBeats = Math.floor((buffer.duration - phase) / beat);

  for (const [slot, pk] of [...slotMap.entries()].sort((a, b) => a[0] - b[0])) {
    const beatPos = slot / subdiv;
    const beatInBar = ((beatPos % 4) + 4) % 4;
    const downbeat = beatInBar < gridStep / 2;
    const strong = downbeat || beatInBar === 2;

    // 第 1 关：以四分音符（slot 偶数）为主，奇数 slot（八分）仅保留较强的起音
    if (!hard && slot % 2 === 1) {
      const localMean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
      if (pk.strength < localMean * 2.2) continue;
    }

    // 频段能量决定大小
    const f = pk.frame;
    const eL = low[f] || 0, eM = mid[f] || 0, eH = high[f] || 0;
    let size;
    if (eL >= eM && eL >= eH * 0.8) size = 'large';
    else if (eM >= eH) size = 'medium';
    else size = 'small';
    // 重拍强制大块
    if (strong && eL > eH) size = 'large';

    // 颜色：强拍绿色，其余灰绿交替
    let color;
    if (strong) color = 'green';
    else color = (slot % 2 === 0) ? 'green' : 'gray';
    if (hard && !strong && slot % 4 === 1) color = 'gray';

    notes.push({
      time: +pk.time.toFixed(4),
      lane: alloc(pk.time),
      size,
      color,
    });
  }

  // 第 2 关：在强小节补 1/16 阶梯（由低频重拍驱动），第 1 关保证每小节重拍有音符
  ensureDownbeats(notes, alloc, phase, beat, totalBeats, hard);

  // 80ms 最小间隔最终保险（相邻过近时删掉较弱的一条——此处已在峰阶段保证）
  notes.sort((a, b) => a.time - b.time);
  const dedup = [];
  for (const n of notes) {
    const prevN = dedup[dedup.length - 1];
    if (prevN && n.time - prevN.time < 0.08) {
      if (n.size === 'large') dedup[dedup.length - 1] = n;
      continue;
    }
    dedup.push(n);
  }

  const fallBeatFactor = hard ? 1.5 : 2.0;
  return {
    bpm: Math.round(bpm * 10) / 10,
    offset: options.offset ?? 0,
    fallTime: +(fallBeatFactor * beat).toFixed(4),
    targetRatio: hard ? 0.7 : 0.6,
    duration: +buffer.duration.toFixed(3),
    meta: {
      detectedPhase: +phase.toFixed(4),
      onsetCount: peaks.length,
      noteCount: dedup.length,
    },
    notes: dedup,
  };
}

/** 保证每个小节的 1、3 拍（鼓点位）有音符，避免空小节；第 2 关注入十六分阶梯 */
function ensureDownbeats(notes, alloc, phase, beat, totalBeats, hard) {
  const existing = new Set(notes.map((n) => Math.round(n.time / (beat / 8))));
  const push = (time, size, color) => {
    const slot8 = Math.round(time / (beat / 8));
    if (existing.has(slot8)) return;
    existing.add(slot8);
    notes.push({ time: +time.toFixed(4), lane: alloc(time), size, color });
  };
  for (let b = 0; b <= totalBeats; b++) {
    const t = phase + b * beat;
    if (b % 4 === 0) push(t, 'large', 'green');
    else if (b % 2 === 0) push(t, 'medium', 'green');
    if (hard && b % 16 === 14) {
      // 每 4 小节末尾四连十六分
      for (let i = 0; i < 4; i++) push(t + (2.5 + i * 0.25) * beat, 'small', i % 2 ? 'gray' : 'green');
    }
  }
}

/** 便捷封装：File → 谱面（分析页面使用） */
export async function analyzeAudioFile(file, level, options) {
  const arrayBuf = await file.arrayBuffer();
  const ACtor = window.AudioContext || window.webkitAudioContext;
  const ac = new ACtor();
  const audioBuf = await ac.decodeAudioData(arrayBuf);
  try { await ac.close(); } catch (_) { /* ignore */ }
  return analyzeAudioBuffer(audioBuf, level, options);
}
