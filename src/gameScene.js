/**
 * gameScene.js —— Canvas 2D 四轨下落式音游场景
 * ---------------------------------------------------------------
 * 时间轴以 AudioEngine 的 AudioContext 时钟为准：
 *   judgeTime = musicTime + chart.offset
 *   progress  = (judgeTime - note.time + fallTime) / fallTime
 * 当 judgeTime === note.time（progress=1）时，方块底部恰好接触判定线。
 */
import {
  LANE_COUNT, NOTE_SIZES, NOTE_COLORS, JUDGE_TEXT_COLORS,
  JUDGE_LINE_RATIO, LEVELS,
} from './config.js';
import {
  getWindows, findJudgableNote, judgeTiming,
  createStats, hitScore, accuracy, judgedCount, targetScore,
} from './judge.js';

const JUDGE_TEXT = {
  perfect: 'PERFECT',
  good: 'GOOD',
  ok: 'OK',
  miss: 'MISS',
};

export class GameScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} chart 谱面 JSON
   * @param {number} level 关卡 1 / 2
   * @param {import('./audioEngine.js').AudioEngine} audio
   * @param {object} cb 回调：onHud(snapshot) / onPauseToggle() / onFinish(result)
   */
  constructor(canvas, chart, level, audio, cb = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.cb = cb;
    this.level = level;

    const lc = LEVELS[level] || LEVELS[1];
    this.levelCfg = lc;
    this.chart = chart;
    this.bpm = chart.bpm || lc.bpm;
    this.offset = chart.offset ?? lc.offset ?? 0;
    const beatDuration = 60 / this.bpm;
    this.fallTime = chart.fallTime || lc.fallBeatFactor * beatDuration;
    this.windows = getWindows(lc.judgeScale);

    const notes = (chart.notes || [])
      .map((n) => ({ ...n, judged: false, judgement: null }))
      .sort((a, b) => a.time - b.time);
    this.notes = notes;

    this.target = targetScore(
      notes.length,
      chart.targetRatio ?? lc.targetRatio
    );

    this.stats = createStats(notes.length);
    this.state = 'idle'; // idle | playing | paused | finished
    this.effects = [];
    this.rings = [];
    this.laneFlash = [0, 0, 0, 0];

    this._resize = this._resize.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._tick = this._tick.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  /* ---------------- 生命周期 ---------------- */

  start() {
    this.state = 'playing';
    this._lastTs = performance.now();
    this.rafId = requestAnimationFrame(this._tick);
    this._pushHud(true);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._lastTs = performance.now();
  }

  /** 不重新加载音频资源的重开（暂停菜单使用） */
  restart() {
    for (const n of this.notes) { n.judged = false; n.judgement = null; }
    this.stats = createStats(this.notes.length);
    this.effects = [];
    this.rings = [];
    this.laneFlash = [0, 0, 0, 0];
    this._finishSent = false;
    this.audio.stopBgm();
    this.audio.startBgm();
    this.state = 'playing';
    this._lastTs = performance.now();
    if (!this.rafId) this.rafId = requestAnimationFrame(this._tick);
    this._pushHud(true);
  }

  destroy() {
    this.state = 'finished';
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('resize', this._resize);
  }

  /* ---------------- 输入 ---------------- */

  _onPointerDown(e) {
    if (this.state !== 'playing') return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const lane = Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((x / rect.width) * LANE_COUNT)));
    this.pressLane(lane);
  }

  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    const map = { d: 0, f: 1, j: 2, k: 3 };
    if (key in map) {
      if (this.state === 'playing') {
        e.preventDefault();
        if (!e.repeat) this.pressLane(map[key]);
      }
      return;
    }
    if (key === 'escape' || key === 'p') {
      this.cb.onPauseToggle?.();
    }
  }

  pressLane(lane) {
    this.laneFlash[lane] = 1;
    const t = this._judgeTime();
    const note = findJudgableNote(this.notes, lane, t, this.windows);
    if (!note) return; // 空按不扣分，仅做轨道反馈
    const deltaMs = (t - note.time) * 1000;
    const j = judgeTiming(deltaMs, this.windows);
    if (j === 'miss' || j === 'none') return;
    this._applyJudge(note, j);
    this.audio.playSfx('hit', j === 'perfect' ? 1 : 0.75);
  }

  /* ---------------- 判定与计分 ---------------- */

  /** @param {boolean} silent 结算收尾时的批量 Miss 不再播放音效 */
  _applyJudge(note, judgement, silent = false) {
    note.judged = true;
    note.judgement = judgement;
    const s = this.stats;
    if (judgement === 'miss') {
      s.miss++;
      s.combo = 0;
      s.score = Math.max(0, s.score + (-30));
      if (!silent) this.audio.playSfx('miss');
    } else {
      s[judgement]++;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.score += hitScore(judgement, s.combo);
    }
    this._spawnEffect(note.lane, judgement);
    if (judgement !== 'miss') {
      this.rings.push({ lane: note.lane, t: 0 });
    }
    this._pushHud();
  }

  _autoMiss(note) {
    note.judged = true;
    note.judgement = 'miss';
    this._applyJudge(note, 'miss');
  }

  _spawnEffect(lane, judgement) {
    this.effects.push({ lane, judgement, t: 0 });
  }

  /* ---------------- 时间 ---------------- */

  _judgeTime() {
    return this.audio.getTime() + this.offset;
  }

  _musicDuration() {
    return this.audio.getDuration()
      || this.chart.duration
      || (this.notes.length ? this.notes[this.notes.length - 1].time + 3 : 30);
  }

  /* ---------------- 主循环 ---------------- */

  _tick(ts) {
    this.rafId = requestAnimationFrame(this._tick);
    const dt = Math.min(0.05, (ts - this._lastTs) / 1000 || 0);
    this._lastTs = ts;

    if (this.state === 'playing') {
      this._update(dt);
    }
    this._draw(dt);
  }

  _update(dt) {
    const t = this._judgeTime();

    // 自动 Miss：超过 OK 窗口仍未点击
    const missSec = this.windows.ok / 1000;
    for (const n of this.notes) {
      if (n.judged) continue;
      if (n.time < t - missSec) this._autoMiss(n);
      else if (n.time > t + this.fallTime + 0.5) break; // 已按时间排序
    }

    // 特效衰减
    for (const f of this.effects) f.t += dt;
    this.effects = this.effects.filter((f) => f.t < 0.65);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.35);
    for (let i = 0; i < LANE_COUNT; i++) {
      this.laneFlash[i] = Math.max(0, this.laneFlash[i] - dt * 5);
    }

    // 曲目结束 → 结算
    if (!this._finishSent && t > this._musicDuration() + 1.0) {
      this._finish();
    }
    this._pushHud();
  }

  _finish() {
    this._finishSent = true;
    this.state = 'finished';
    const s = this.stats;
    // 理论上所有音符已被自动 Miss，保险处理（静默，不再刷音效）
    for (const n of this.notes) {
      if (!n.judged) {
        n.judged = true;
        n.judgement = 'miss';
        this._applyJudge(n, 'miss', true);
      }
    }
    const acc = accuracy(s);
    const passed = s.score >= this.target;
    this.cb.onFinish?.({
      level: this.level,
      passed,
      score: s.score,
      target: this.target,
      maxCombo: s.maxCombo,
      accuracy: acc,
      perfect: s.perfect,
      good: s.good,
      ok: s.ok,
      miss: s.miss,
      noteCount: s.noteCount,
      judged: judgedCount(s),
    });
  }

  /* ---------------- HUD ---------------- */

  _pushHud(force = false) {
    const s = this.stats;
    const t = this._judgeTime();
    const snap = {
      score: s.score,
      combo: s.combo,
      acc: accuracy(s),
      target: this.target,
      progress: Math.min(1, Math.max(0, t / this._musicDuration())),
    };
    // 简单变化检测，减少 DOM 写入
    const key = `${snap.score}|${snap.combo}|${snap.acc.toFixed(3)}|${snap.progress.toFixed(3)}`;
    if (force || key !== this._lastHudKey) {
      this._lastHudKey = key;
      this.cb.onHud?.(snap);
    }
  }

  /* ---------------- 画布尺寸 ---------------- */

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.laneW = w / LANE_COUNT;
    this.judgeY = h * JUDGE_LINE_RATIO;
  }

  /* ---------------- 绘制 ---------------- */

  _draw(dt) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // 背景：从上往下的深色渐变（让方块更突出）
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(12,22,16,0.82)');
    bg.addColorStop(0.7, 'rgba(8,16,11,0.7)');
    bg.addColorStop(1, 'rgba(5,10,7,0.9)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    this._drawLanes();
    this._drawNotes();
    this._drawJudgeLine();
    this._drawEffects();
  }

  _drawLanes() {
    const { ctx, laneW, h, judgeY } = this;
    for (let i = 0; i < LANE_COUNT; i++) {
      const x = i * laneW;
      // 轨道底
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.055)';
      ctx.fillRect(x, 0, laneW, h);

      // 按下闪光
      const flash = this.laneFlash[i];
      if (flash > 0) {
        const g = ctx.createLinearGradient(0, judgeY - 160, 0, judgeY + 30);
        g.addColorStop(0, 'rgba(61,220,132,0)');
        g.addColorStop(1, `rgba(61,220,132,${0.28 * flash})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, judgeY - 160, laneW, 190);
      }
    }
    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LANE_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(i * laneW, 0);
      ctx.lineTo(i * laneW, h);
      ctx.stroke();
    }
  }

  _drawNotes() {
    const { ctx, laneW, judgeY } = this;
    const t = this._judgeTime();

    for (const n of this.notes) {
      const sizeCfg = NOTE_SIZES[n.size] || NOTE_SIZES.medium;
      const noteH = sizeCfg.h;
      const p = (t - n.time + this.fallTime) / this.fallTime;
      if (p < -0.05 || p > 1.12) continue;
      if (n.judged && n.judgement !== 'miss') continue;

      // 方块底部：p=0 时在屏幕外 -noteH，p=1 时恰好为 judgeY
      const bottom = -noteH + p * (judgeY + noteH);
      const top = bottom - noteH;
      if (top > this.h + 40) continue;

      const noteW = laneW * sizeCfg.wRatio;
      const cx = n.lane * laneW + laneW / 2;
      const x = cx - noteW / 2;

      const isMissed = n.judged && n.judgement === 'miss';
      const baseColor = NOTE_COLORS[n.color] || NOTE_COLORS.green;

      ctx.save();
      if (isMissed) ctx.globalAlpha = 0.35;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = n.size === 'large' ? 22 : 14;

      // 主体（圆角矩形 + 竖向高光）
      this._roundRect(x, top, noteW, noteH, Math.min(12, noteH * 0.18));
      ctx.fillStyle = baseColor;
      ctx.fill();

      ctx.shadowBlur = 0;
      const gloss = ctx.createLinearGradient(0, top, 0, bottom);
      gloss.addColorStop(0, 'rgba(255,255,255,.35)');
      gloss.addColorStop(0.5, 'rgba(255,255,255,.06)');
      gloss.addColorStop(1, 'rgba(0,0,0,.22)');
      this._roundRect(x, top, noteW, noteH, Math.min(12, noteH * 0.18));
      ctx.fillStyle = gloss;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1.5;
      this._roundRect(x + 0.75, top + 0.75, noteW - 1.5, noteH - 1.5, Math.min(12, noteH * 0.18));
      ctx.stroke();

      // 大块中线强调（重拍）
      if (n.size === 'large') {
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillRect(cx - noteW * 0.28, bottom - 6, noteW * 0.56, 3);
      }
      ctx.restore();
    }
  }

  _drawJudgeLine() {
    const { ctx, w, laneW, judgeY } = this;
    ctx.save();
    // 外发光
    ctx.shadowColor = '#58e09a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(200,255,223,.95)';
    ctx.fillRect(0, judgeY - 3, w, 6);
    ctx.shadowBlur = 0;

    // 每轨接收端括弧
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < LANE_COUNT; i++) {
      const cx = i * laneW + laneW / 2;
      const ww = laneW * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx - ww, judgeY);
      ctx.lineTo(cx - ww, judgeY + 14);
      ctx.moveTo(cx + ww, judgeY);
      ctx.lineTo(cx + ww, judgeY + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawEffects() {
    const { ctx, laneW, judgeY } = this;

    // 命中扩散环
    for (const r of this.rings) {
      const k = r.t / 0.35;
      const cx = r.lane * laneW + laneW / 2;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = 'rgba(125,255,206,.9)';
      ctx.lineWidth = 3 * (1 - k) + 1;
      const rw = laneW * 0.35 + k * laneW * 0.4;
      const rh = 16 + k * 40;
      this._roundRect(cx - rw, judgeY - rh / 2, rw * 2, rh, 14);
      ctx.stroke();
      ctx.restore();
    }

    // 判定文字
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.effects) {
      const k = f.t / 0.65;
      const cx = f.lane * laneW + laneW / 2;
      const y = judgeY - 70 - k * 46;
      const color = JUDGE_TEXT_COLORS[f.judgement];
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `700 ${f.judgement === 'perfect' ? 24 : 20}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillText(JUDGE_TEXT[f.judgement], cx, y);
    }
    ctx.restore();

    // 中央大连击
    const combo = this.stats.combo;
    if (combo >= 5 && this.state === 'playing') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pulse = 1 + Math.min(0.12, (this.laneFlash[0] + this.laneFlash[1] + this.laneFlash[2] + this.laneFlash[3]) * 0.03);
      ctx.font = `800 ${Math.round(40 * pulse)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(214,255,230,.92)';
      ctx.shadowColor = 'rgba(88,224,154,.8)';
      ctx.shadowBlur = 24;
      ctx.fillText(`${combo}`, this.w / 2, judgeY - 150);
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(214,255,230,.7)';
      ctx.fillText('COMBO', this.w / 2, judgeY - 118);
      ctx.restore();
    }
  }

  /** 圆角矩形路径（兼容不支持 ctx.roundRect 的浏览器） */
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
