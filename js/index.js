// js/index.js — enqueue NAS downloads, poll status and show task panel

// Global download locks
const downloadLocks = window.__downloadLocks || (window.__downloadLocks = new Set());

function getSongByIndexType(index, type) {
  if (type === "search") return state.searchResults[index];
  if (type === "online") return state.onlineSongs[index];
  if (type === "playlist") return state.playlistSongs[index];
  if (type === "favorites") return state.favoriteSongs[index];
  return null;
}

// --- Task Panel UI ---
function ensureTaskPanel() {
  if (document.getElementById('download-task-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'download-task-panel';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '12px';
  panel.style.width = '320px';
  panel.style.maxHeight = '50vh';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(255,255,255,0.95)';
  panel.style.border = '1px solid #ddd';
  panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  panel.style.padding = '8px';
  panel.style.zIndex = 100000;
  panel.innerHTML = `<div style="font-weight:600;margin-bottom:8px;">下载任务</div><div id="download-task-list"></div>`;
  document.body.appendChild(panel);
}

function renderTaskList(tasks) {
  ensureTaskPanel();
  const list = document.getElementById('download-task-list');
  list.innerHTML = '';
  tasks.forEach(t => {
    const item = document.createElement('div');
    item.style.borderTop = '1px solid #eee';
    item.style.padding = '6px 4px';
    const title = (t.data && t.data.song && t.data.song.name) ? t.data.song.name : '未知歌曲';
    const state = t.state || 'unknown';
    const progress = t.progress || 0;
    item.innerHTML = `<div style="font-size:13px;font-weight:500;">${title}</div>
      <div style="font-size:12px;color:#666;margin-top:4px;">状态: ${state} ${state==='active' || state==='waiting' ? ` - ${Math.min(100,progress)}%` : ''}</div>`;
    if (state === 'waiting' || state === 'delayed') {
      const btn = document.createElement('button');
      btn.textContent = '取消';
      btn.style.marginTop = '6px';
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const r = await fetch(`/api/download/cancel/${encodeURIComponent(t.id)}`, { method: 'POST', credentials: 'same-origin' });
          const j = await r.json();
          if (r.ok) {
            showNotification('任务已取消', 'success');
            refreshTaskPanel();
          } else {
            showNotification(j && j.error ? j.error : '取消失败', 'error');
          }
        } catch (e) {
          showNotification('取消请求失败', 'error');
        } finally {
          btn.disabled = false;
        }
      };
      item.appendChild(btn);
    }
    list.appendChild(item);
  });
}

async function refreshTaskPanel() {
  try {
    const res = await fetch('/api/download/list', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    renderTaskList(data);
  } catch (e) {
    console.warn('refreshTaskPanel failed', e);
  }
}

// auto-refresh panel every 5s
setInterval(() => { refreshTaskPanel(); }, 5000);

// Polling utility
function pollDownloadStatus(taskId, { interval = 2000, timeout = 1000 * 60 * 15 } = {}, onTick) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stopped = false;

    async function tick() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/download/status/${encodeURIComponent(taskId)}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('状态查询失败');
        const data = await res.json();
        onTick && onTick(data);
        if (data.state === 'completed') return resolve({ ok: true, result: data.result || null });
        if (data.state === 'failed') return resolve({ ok: false, error: data.result || 'failed' });
      } catch (err) {
        console.warn('pollDownloadStatus error', err);
      }

      if (Date.now() - start > timeout) {
        stopped = true;
        return resolve({ ok: false, error: 'timeout' });
      }

      setTimeout(tick, interval);
    }

    tick();
  });
}

// triggerDownload kept as before (fetch->blob fallback)
async function triggerDownload(url, filename) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) {
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html') && !contentType.includes('audio')) {
        throw new Error('response is HTML');
      }
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename || '';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      return true;
    } else {
      throw new Error('fetch failed');
    }
  } catch (err) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      if (filename) a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch (err2) {
      console.warn('triggerDownload fallback failed', err2);
      return false;
    }
  }
}

// downloadWithQualityToNas now enqueues and polls, and updates panel
async function downloadWithQualityToNas(event, index, type, quality) {
  event.stopPropagation();
  const song = getSongByIndexType(index, type);
  if (!song) return;

  const songKey = song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('该歌曲正在下载中，请稍后', 'warning');
    return;
  }

  const dynamicMenu = document.querySelector('.dynamic-quality-menu');
  if (dynamicMenu) dynamicMenu.remove();

  if (songKey) downloadLocks.add(songKey);

  try {
    showNotification(`已向队列提交: ${song.name}`, 'info');
    const res = await fetch('/api/download', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song, quality })
    });

    if (!res.ok) throw new Error('入队失败');
    const data = await res.json();
    if (!data || !data.taskId) throw new Error(data && data.error ? data.error : '无效的入队响应');

    const taskId = data.taskId;
    showNotification(`已加入队列，任务ID: ${taskId}`, 'success');
    // refresh task panel immediately
    refreshTaskPanel();

    const result = await pollDownloadStatus(taskId, { interval: 2000, timeout: 1000 * 60 * 15 }, (status) => {
      if (status && (status.state === 'active' || status.state === 'waiting')) {
        refreshTaskPanel();
      }
    });

    if (!result.ok) {
      if (result.error === 'timeout') {
        showNotification('下载超时，请稍后到任务历史查看或重试', 'error');
      } else {
        showNotification(`下载失败: ${result.error}`, 'error');
      }
    } else {
      const final = result.result && result.result[0] ? result.result[0] : result.result;
      const filename = (final && final.filename) || (result.result && result.result.filename) || null;
      if (final && final.success) {
        showNotification(`下载完成: ${filename || song.name}`, 'success');
      } else if (filename) {
        showNotification(`下载完成: ${filename}`, 'success');
      } else {
        showNotification('下载完成（结果未知）', 'success');
      }
    }
  } catch (error) {
    console.error('下载到NAS失败:', error);
    showNotification('下载到NAS失败，请检查网络或稍后重试', 'error');
  } finally {
    if (songKey) downloadLocks.delete(songKey);
    refreshTaskPanel();
  }
}

// initialize panel on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureTaskPanel(); refreshTaskPanel(); });
} else {
  ensureTaskPanel(); refreshTaskPanel();
}
