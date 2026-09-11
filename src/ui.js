/**
 * ui.js —— DOM 页面管理（首页 / 游戏 HUD / 暂停 / 结算 / 设置 / Toast）
 * 纯视图层，业务编排由 main.js 完成。
 */

const $ = (id) => document.getElementById(id);

export function createUI() {
  const els = {
    screens: {
      home: $('home-screen'),
      game: $('game-screen'),
      result: $('result-screen'),
    },

    // 首页
    btnStart: $('btn-start'),
    levelPanel: $('level-panel'),
    levelBtns: [
      document.querySelector('[data-level="1"]'),
      document.querySelector('[data-level="2"]'),
    ],
    btnSettings: $('btn-settings'),
    btnReset: $('btn-reset'),
    thanksBadge: $('thanks-badge'),
    modelLoading: $('model-loading'),
    modelPercent: $('model-percent'),
    modelToast: $('model-toast'),

    // 游戏 HUD
    hudScore: $('hud-score'),
    hudCombo: $('hud-combo'),
    hudAcc: $('hud-acc'),
    hudTarget: $('hud-target'),
    progressBar: $('progress-bar'),
    btnPause: $('btn-pause'),
    btnExit: $('btn-exit'),
    countdown: $('countdown'),
    pauseOverlay: $('pause-overlay'),
    btnResume: $('btn-resume'),
    btnRetryPause: $('btn-retry'),
    btnQuit: $('btn-quit'),

    // 结算
    resultTitle: $('result-title'),
    resultSub: $('result-sub'),
    rScore: $('r-score'),
    rMaxCombo: $('r-maxcombo'),
    rAcc: $('r-acc'),
    rTarget: $('r-target'),
    rPerfect: $('r-perfect'),
    rGood: $('r-good'),
    rOk: $('r-ok'),
    rMiss: $('r-miss'),
    btnResultRetry: $('btn-result-retry'),
    btnResultHome: $('btn-result-home'),
    btnResultNext: $('btn-result-next'),

    // 设置
    settingsModal: $('settings-modal'),
    bgmVolume: $('bgm-volume'),
    sfxVolume: $('sfx-volume'),
    bgmVolumeVal: $('bgm-volume-val'),
    sfxVolumeVal: $('sfx-volume-val'),
    btnSettingsClose: $('btn-settings-close'),

    toast: $('toast'),

    // 致命资源失败遮罩
    assetError: $('asset-error'),
    assetErrorMsg: $('asset-error-msg'),
    btnAssetRetry: $('btn-asset-retry'),
  };

  /* ---------------- 屏幕切换 ---------------- */
  function showScreen(name) {
    Object.entries(els.screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg, ms = 2200) {
    const t = els.toast;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------------- 首页状态 ---------------- */
  function renderHome(save) {
    const [, lv2] = els.levelBtns;
    const locked2 = save.unlockedLevel < 2;
    // 不用原生 disabled：保证锁定按钮仍可点击并弹出提示
    lv2.classList.toggle('locked', locked2);
    lv2.setAttribute('aria-disabled', String(locked2));
    lv2.disabled = false;
    els.thanksBadge.hidden = !save.level2Cleared;
    els.levelPanel.hidden = true;
  }

  function toggleLevelPanel(force) {
    els.levelPanel.hidden = force !== undefined ? !force : !els.levelPanel.hidden;
  }

  /* ---------------- 游戏 HUD ---------------- */
  function setHud(snap) {
    els.hudScore.textContent = snap.score;
    els.hudCombo.textContent = snap.combo;
    els.hudAcc.textContent = `${Math.round(snap.acc * 100)}%`;
    els.hudTarget.textContent = snap.target;
    els.progressBar.style.width = `${Math.round(snap.progress * 100)}%`;
  }

  function resetHud() {
    setHud({ score: 0, combo: 0, acc: 1, target: 0, progress: 0 });
  }

  let countdownTimer = null;
  function setCountdown(text) {
    const el = els.countdown;
    if (text === null) {
      el.hidden = true;
      el.textContent = '';
      clearInterval(countdownTimer);
      return;
    }
    el.hidden = false;
    el.textContent = text;
    // 重启 CSS pop 动画
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  function showPause(show) {
    els.pauseOverlay.hidden = !show;
  }

  /* ---------------- 结算 ---------------- */
  function renderResult(level, result, save) {
    const pass = result.passed;
    els.resultTitle.classList.toggle('fail', !pass);
    if (pass) {
      els.resultTitle.textContent = level === 2 ? '通关！' : '关卡完成！';
      els.resultSub.textContent = level === 2
        ? '林与城在此刻交响 ✦ 感谢游玩'
        : '城市之门已开启，关卡 2 已解锁';
    } else {
      els.resultTitle.textContent = '未达标';
      els.resultSub.textContent = `还差 ${Math.max(0, result.target - result.score)} 分，再试一次吧`;
    }
    els.rScore.textContent = result.score;
    els.rMaxCombo.textContent = result.maxCombo;
    els.rAcc.textContent = `${Math.round(result.accuracy * 100)}%`;
    els.rTarget.textContent = result.target;
    els.rPerfect.textContent = result.perfect;
    els.rGood.textContent = result.good;
    els.rOk.textContent = result.ok;
    els.rMiss.textContent = result.miss;

    // 只有通关第 1 关时显示“下一关”
    els.btnResultNext.hidden = !(pass && level === 1 && save.unlockedLevel >= 2);
  }

  /* ---------------- 设置 ---------------- */
  function syncSettings(save) {
    els.bgmVolume.value = Math.round(save.volume.bgm * 100);
    els.sfxVolume.value = Math.round(save.volume.sfx * 100);
    els.bgmVolumeVal.textContent = els.bgmVolume.value;
    els.sfxVolumeVal.textContent = els.sfxVolume.value;
  }
  function showSettings(show) {
    els.settingsModal.hidden = !show;
  }

  /* ---------------- 致命资源失败（带重试） ---------------- */
  function fatalError(msg, show = true) {
    if (msg) els.assetErrorMsg.textContent = msg;
    els.assetError.hidden = !show;
  }

  /* ---------------- 模型加载反馈 ---------------- */
  function modelLoading(show, pct = 0) {
    els.modelLoading.hidden = !show;
    els.modelPercent.textContent = `${pct}%`;
  }
  let modelToastTimer = null;
  function modelNotice(msg) {
    els.modelToast.textContent = msg;
    els.modelToast.hidden = false;
    clearTimeout(modelToastTimer);
    modelToastTimer = setTimeout(() => { els.modelToast.hidden = true; }, 6000);
  }

  return {
    els,
    showScreen,
    toast,
    renderHome,
    toggleLevelPanel,
    setHud,
    resetHud,
    setCountdown,
    showPause,
    renderResult,
    syncSettings,
    showSettings,
    modelLoading,
    modelNotice,
    fatalError,
  };
}
