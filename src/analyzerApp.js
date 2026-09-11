/**
 * analyzerApp.js —— 谱面分析页面交互逻辑（analyzer.html）
 */
import { analyzeAudioFile } from './chartAnalyzer.js';

function setup(level) {
  const fileInput = document.getElementById(`file${level}`);
  const bpmInput = document.getElementById(`bpm${level}`);
  const offInput = document.getElementById(`off${level}`);
  const goBtn = document.getElementById(`go${level}`);
  const dlBtn = document.getElementById(`dl${level}`);
  const statusEl = document.getElementById(`status${level}`);
  const outEl = document.getElementById(`out${level}`);
  let chart = null;

  const setStatus = (msg, isErr = false) => {
    statusEl.textContent = msg;
    statusEl.className = isErr ? 'status err' : 'status';
  };

  goBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      setStatus('请先选择一个音频文件。', true);
      return;
    }
    goBtn.disabled = true;
    dlBtn.disabled = true;
    setStatus('正在解码并分析音频（可能需要数秒）…');
    try {
      const bpm = bpmInput.value ? Number(bpmInput.value) : null;
      const offset = offInput.value ? Number(offInput.value) : 0;
      chart = await analyzeAudioFile(file, level, { bpm, offset });
      const json = JSON.stringify(chart, null, 2);
      outEl.textContent = json;
      outEl.hidden = false;
      dlBtn.disabled = false;
      setStatus(
        `完成 ✓ BPM=${chart.bpm}，音符数=${chart.notes.length}，` +
        `fallTime=${chart.fallTime}s，时长=${chart.duration}s。` +
        `${chart.meta ? `（检测到 onset ${chart.meta.onsetCount} 个）` : ''}`
      );
    } catch (err) {
      console.error(err);
      setStatus(`分析失败：${err.message || err}`, true);
    } finally {
      goBtn.disabled = false;
    }
  });

  dlBtn.addEventListener('click', () => {
    if (!chart) return;
    const blob = new Blob([JSON.stringify(chart, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level${level}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

setup(1);
setup(2);
