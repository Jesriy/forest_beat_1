/**
 * audioEngine.js —— Web Audio 音频引擎
 * ---------------------------------------------------------------
 * 1. BGM 使用 AudioBufferSourceNode 播放，游戏时间轴以 AudioContext 时钟
 *    （ctx.currentTime）为准，避免 requestAnimationFrame 时间漂移。
 * 2. 命中 / 失误 / 过关使用短缓冲，可反复触发。
 * 3. 当 public/assets/audio 下的 mp3 缺失时，自动用振荡器合成占位音频，
 *    占位 BGM 与谱面 BPM 对齐，不影响玩法；把真实 mp3 放进去即自动替换。
 * 4. 首次用户点击“开始”时必须调用 ensure()，以满足浏览器自动播放策略。
 */
import { ASSETS, assetUrl } from './config.js';

/* ---------- 兼容性 ---------- */
function createAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) throw new Error('当前浏览器不支持 Web Audio API');
  return new Ctor();
}
function createOfflineContext(seconds) {
  const sr = 44100;
  const length = Math.ceil(sr * seconds);
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Ctor) {
    try { return new Ctor(2, length, sr); } catch (_) { /* ignore */ }
  }
  return new OfflineAudioContext(2, length, sr);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.volume = { bgm: 0.8, sfx: 0.9 };

    this.bgmBuffer = null;       // 当前关卡 BGM 解码缓冲
    this.bgmSource = null;
    this.bgmEndedHandler = null;

    // 音乐时间轴锚点：musicTime = now - anchorCtx + anchorMusic
    this._anchorCtx = 0;
    this._anchorMusic = 0;
    this._pauseMusic = 0;
    this._paused = false;
    this._started = false;

    this.sfxBuffers = {}; // hit / miss / clear（真实或合成）
  }

  /** 必须在用户手势中调用：创建 / 恢复 AudioContext */
  async ensure() {
    if (!this.ctx) {
      this.ctx = createAudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.volume.bgm;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.volume.sfx;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* ignore */ }
    }
  }

  setVolumes({ bgm, sfx }) {
    if (bgm !== undefined) this.volume.bgm = bgm;
    if (sfx !== undefined) this.volume.sfx = sfx;
    if (this.ctx) {
      this.bgmGain.gain.setTargetAtTime(this.volume.bgm, this.ctx.currentTime, 0.02);
      this.sfxGain.gain.setTargetAtTime(this.volume.sfx, this.ctx.currentTime, 0.02);
    }
  }

  /** 从 URL 解码音频；失败（文件不存在 / 格式不支持）返回 null */
  async _decodeUrl(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      // dev 服务器对缺失文件可能回退返回 index.html（200 + text/html），直接当作缺失
      const ctype = resp.headers.get('content-type') || '';
      if (ctype.includes('text/html')) return null;
      const ab = await resp.arrayBuffer();
      return await this.ctx.decodeAudioData(ab);
    } catch (err) {
      console.warn(`[audio] 资源加载失败，使用占位音频：${url}`, err);
      return null;
    }
  }

  /**
   * 加载某一关的全部音频
   * @returns {{usingSynthBgm:boolean}} 告诉外层 BGM 是否为合成占位
   */
  async loadLevel(level, chart) {
    await this.ensure();
    const bgmUrl = assetUrl(ASSETS.audio[`level${level}`]);
    let bgm = await this._decodeUrl(bgmUrl);
    let usingSynthBgm = false;
    if (!bgm) {
      bgm = await renderSynthBgm(chart, level);
      usingSynthBgm = true;
    }
    this.bgmBuffer = bgm;

    // 音效：有真实文件用真实的，没有就合成
    const sfxJobs = ['hit', 'miss', 'clear'].map(async (name) => {
      const buf = await this._decodeUrl(assetUrl(ASSETS.audio[name]));
      this.sfxBuffers[name] = buf || (await SYNTH[name]());
    });
    await Promise.all(sfxJobs);
    return { usingSynthBgm };
  }

  /** 开始播放 BGM（在倒计时结束时调用） */
  startBgm() {
    if (!this.ctx || !this.bgmBuffer) return;
    this.stopBgm();
    const src = this.ctx.createBufferSource();
    src.buffer = this.bgmBuffer;
    src.connect(this.bgmGain);
    const startDelay = 0.05;
    this._anchorCtx = this.ctx.currentTime + startDelay;
    this._anchorMusic = 0;
    this._paused = false;
    this._started = true;
    src.onended = () => {
      if (this.bgmSource === src && this.bgmEndedHandler) this.bgmEndedHandler();
    };
    src.start(this._anchorCtx);
    this.bgmSource = src;
  }

  /** 以 AudioContext 时钟为准的音乐播放时间（秒） */
  getTime() {
    if (!this._started) return 0;
    if (this._paused) return this._pauseMusic;
    return Math.max(0, this.ctx.currentTime - this._anchorCtx + this._anchorMusic);
  }

  getDuration() {
    return this.bgmBuffer ? this.bgmBuffer.duration : 0;
  }

  get started() { return this._started; }

  async pause() {
    if (!this._started || this._paused) return;
    this._pauseMusic = this.getTime();
    this._paused = true;
    if (this.ctx.state === 'running') {
      try { await this.ctx.suspend(); } catch (_) { /* ignore */ }
    }
  }

  async resume() {
    if (!this._started || !this._paused) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* ignore */ }
    }
    this._anchorCtx = this.ctx.currentTime;
    this._anchorMusic = this._pauseMusic;
    this._paused = false;
  }

  get paused() { return this._paused; }

  stopBgm() {
    if (this.bgmSource) {
      try {
        this.bgmSource.onended = null;
        this.bgmSource.stop();
      } catch (_) { /* 已停止 */ }
      try { this.bgmSource.disconnect(); } catch (_) { /* ignore */ }
      this.bgmSource = null;
    }
    this._started = false;
    this._paused = false;
  }

  /** 播放短音效 */
  playSfx(name, volumeScale = 1) {
    if (!this.ctx || this._paused) return;
    const buf = this.sfxBuffers[name];
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volumeScale;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }
}

/* ===============================================================
   以下为“占位音频”合成：只在对应 mp3 缺失时使用
   =============================================================== */

function makeNoiseBuffer(ctx, seconds) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* 鼓组 */
function kick(ctx, t, dest, vel = 1) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  g.gain.setValueAtTime(0.9 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(g).connect(dest);
  osc.start(t); osc.stop(t + 0.25);
}
function snare(ctx, t, dest, noiseBuf, vel = 1) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  n.connect(hp).connect(g).connect(dest);
  n.start(t); n.stop(t + 0.2);
  const osc = ctx.createOscillator();
  osc.type = 'triangle'; osc.frequency.value = 190;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.3 * vel, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(g2).connect(dest);
  osc.start(t); osc.stop(t + 0.14);
}
function hat(ctx, t, dest, noiseBuf, vel = 0.5, dur = 0.05) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(hp).connect(g).connect(dest);
  n.start(t); n.stop(t + dur + 0.02);
}
function tone(ctx, t, freq, dur, dest, { type = 'triangle', vel = 0.3, cutoff = 2200 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type; osc.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(f).connect(g).connect(dest);
  osc.start(t); osc.stop(t + dur + 0.05);
}

/* Am - F - C - G 进行 */
const CHORDS = [
  { root: 110.00, triad: [220.00, 261.63, 329.63] }, // Am
  { root: 87.31,  triad: [174.61, 220.00, 261.63] }, // F
  { root: 130.81, triad: [261.63, 329.63, 392.00] }, // C
  { root: 98.00,  triad: [196.00, 246.94, 293.66] }, // G
];
const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

/**
 * 渲染一段与谱面 BPM 对齐的简易伴奏（无 BGM 文件时的占位）
 */
async function renderSynthBgm(chart, level) {
  const bpm = chart.bpm || 120;
  const beat = 60 / bpm;
  const lastNote = chart.notes?.length ? chart.notes[chart.notes.length - 1].time : 30;
  const seconds = Math.max(20, Math.min(180, (chart.duration || lastNote + 3)));

  const ctx = createOfflineContext(seconds);
  const noise = makeNoiseBuffer(ctx, 1);
  const bus = ctx.createGain();
  bus.gain.value = level === 2 ? 0.62 : 0.55;
  // 简单总线压缩感：用 waveshaper 前级 + 主音量即可
  bus.connect(ctx.destination);

  const totalBeats = seconds / beat;
  const bars = Math.ceil(totalBeats / 4);
  const hard = level === 2; // 第 2 关更密集

  for (let bar = 0; bar < bars; bar++) {
    const chord = CHORDS[bar % 4];
    const barStart = bar * 4 * beat;
    if (barStart >= seconds) break;

    // 垫底 Pad（整小节和弦）
    for (const f of chord.triad) {
      tone(ctx, barStart, f, 4 * beat, bus, { type: 'sine', vel: hard ? 0.05 : 0.07, cutoff: 1600 });
    }

    for (let b = 0; b < 4; b++) {
      const t = barStart + b * beat;
      if (t >= seconds) break;

      // 底鼓：每拍；第 2 关更有力
      kick(ctx, t, bus, hard ? 1 : 0.9);
      // 军鼓：2、4 拍
      if (b === 1 || b === 3) snare(ctx, t, bus, noise, 0.95);

      // 踩镲
      hat(ctx, t, bus, noise, b % 2 ? 0.9 : 0.55);
      hat(ctx, t + beat / 2, bus, noise, 0.5);
      if (hard) {
        hat(ctx, t + beat / 4, bus, noise, 0.32, 0.035);
        hat(ctx, t + (3 * beat) / 4, bus, noise, 0.32, 0.035);
      }

      // 贝斯
      const bassFreq = chord.root / 2;
      if (hard) {
        tone(ctx, t, bassFreq, beat * 0.42, bus, { type: 'sawtooth', vel: 0.16, cutoff: 700 });
        tone(ctx, t + beat / 2, bassFreq, beat * 0.36, bus, { type: 'sawtooth', vel: 0.13, cutoff: 600 });
      } else if (b === 0 || b === 2) {
        tone(ctx, t, bassFreq, beat * 1.6, bus, { type: 'sawtooth', vel: 0.14, cutoff: 600 });
      }
    }

    // 第 2 关：五声音阶琶音点缀
    if (hard && bar % 2 === 1) {
      for (let i = 0; i < 8; i++) {
        const t = barStart + i * (beat / 2);
        const f = PENTA[(bar * 3 + i * 2) % PENTA.length] * 2;
        tone(ctx, t, f, 0.18, bus, { type: 'square', vel: 0.045, cutoff: 3000 });
      }
    }
  }

  return await ctx.startRendering();
}

/* ---------- 音效合成 ---------- */
async function synthHit() {
  const ctx = createOfflineContext(0.16);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(720, 0);
  osc.frequency.exponentialRampToValueAtTime(1240, 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.14);
  osc.connect(g).connect(ctx.destination);
  osc.start(0); osc.stop(0.15);
  return ctx.startRendering();
}
async function synthMiss() {
  const ctx = createOfflineContext(0.28);
  const noise = makeNoiseBuffer(ctx, 0.2);
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.22);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0); n.stop(0.25);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, 0);
  osc.frequency.exponentialRampToValueAtTime(85, 0.2);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.22, 0);
  g2.gain.exponentialRampToValueAtTime(0.001, 0.24);
  osc.connect(g2).connect(ctx.destination);
  osc.start(0); osc.stop(0.25);
  return ctx.startRendering();
}
async function synthClear() {
  const ctx = createOfflineContext(1.1);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = i * 0.12;
    tone(ctx, t, f, 0.42, ctx.destination, { type: 'triangle', vel: 0.28, cutoff: 4000 });
    tone(ctx, t, f / 2, 0.5, ctx.destination, { type: 'sine', vel: 0.12, cutoff: 1200 });
  });
  // 收尾闪亮音
  tone(ctx, 0.5, 1567.98, 0.45, ctx.destination, { type: 'sine', vel: 0.16, cutoff: 6000 });
  return ctx.startRendering();
}

const SYNTH = { hit: synthHit, miss: synthMiss, clear: synthClear };
