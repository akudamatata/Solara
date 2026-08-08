// js/index.js — add NAS enqueue + polling UI integration

// (This file patches the downloadWithQualityToNas function to enqueue downloads and poll status.)

// 全局下载锁（按 song.id 记录正在进行的下载）
const downloadLocks = window.__downloadLocks || (window.__downloadLocks = new Set());

function getSongByIndexType(index, type) {
  if (type === "search") return state.searchResults[index];
  if (type === "online") return state.onlineSongs[index];
  if (type === "playlist") return state.playlistSongs[index];
  if (type === "favorites") return state.favoriteSongs[index];
  return null;
}

// 简单的轮询器，用于查询队列任务状态
function pollDownloadStatus(taskId, { interval = 2000, timeout = 1000 * 60 * 15 } = {}, onTick) {
  return new Promise((resolve, reject) => {
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
        // 报错但继续重试，除非超时
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

// 已存在的 triggerDownload、showQualityMenu、downloadSong、downloadWithQuality 保持不变 — 这里只替换 downloadWithQualityToNas

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

function showQualityMenu(event, index, type) {
  event.stopPropagation();

  const existingMenu = document.querySelector('.dynamic-quality-menu');
  if (existingMenu) existingMenu.remove();

  const song = getSongByIndexType(index, type);

  const menu = document.createElement('div');
  menu.className = 'dynamic-quality-menu';
  menu.innerHTML = `
    <div class="quality-menu-title">下载到本地</div>
    <div class="quality-option" data-quality="128" data-action="download-local">标准音质 (128k)</div>
    <div class="quality-option" data-quality="192" data-action="download-local">高音质 (192k)</div>
    <div class="quality-option" data-quality="320" data-action="download-local">超高音质 (320k)</div>
    <div class="quality-option" data-quality="999" data-action="download-local">无损音质</div>
    <div class="quality-menu-divider"></div>
    <div class="quality-menu-title">下载到NAS</div>
    <div class="quality-option" data-quality="128" data-action="download-nas">标准音质 (128k)</div>
    <div class="quality-option" data-quality="192" data-action="download-nas">高音质 (192k)</div>
    <div class="quality-option" data-quality="320" data-action="download-nas">超高音质 (320k)</div>
    <div class="quality-option" data-quality="999" data-action="download-nas">无损音质</div>
  `;

  const button = event.target.closest('button');
  const rect = button && button.getBoundingClientRect ? button.getBoundingClientRect() : { bottom: 0, left: 0 };
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 5) + 'px';
  menu.style.left = (rect.left - 50) + 'px';
  menu.style.zIndex = '10000';

  if (song && song.id && downloadLocks.has(String(song.id))) {
    setTimeout(() => {
      const options = menu.querySelectorAll('.quality-option');
      options.forEach(opt => {
        opt.classList.add('disabled');
        opt.setAttribute('aria-disabled', 'true');
      });
    }, 0);
  }

  menu.addEventListener('click', (e) => {
    const option = e.target.closest('.quality-option');
    if (!option) return;
    if (option.classList.contains('disabled')) {
      e.stopPropagation();
      showNotification('该歌曲正在下载中，请稍后', 'warning');
      return;
    }
    e.stopPropagation();
    const quality = option.dataset.quality;
    const action = option.dataset.action;
    menu.remove();
    if (action === 'download-nas') {
      downloadWithQualityToNas(event, index, type, quality);
    } else {
      downloadWithQuality(event, index, type, quality);
    }
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}

async function downloadSong(song, quality = '320') {
  const songKey = song && song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('下载已在进行中，请勿重复操作', 'warning');
    return;
  }
  if (songKey) downloadLocks.add(songKey);

  try {
    showNotification('正在获取下载链接...');

    const audioUrl = API.getSongUrl(song, quality);
    const audioData = await API.fetchJson(audioUrl);

    if (audioData && audioData.url) {
      const proxiedAudioUrl = typeof buildAudioProxyUrl === 'function' ? buildAudioProxyUrl(audioData.url) : null;
      const preferredAudioUrl = typeof preferHttpsUrl === 'function' ? preferHttpsUrl(audioData.url) : audioData.url;
      const downloadUrl = proxiedAudioUrl || preferredAudioUrl || audioData.url;

      const preferredExtension = quality === '999' ? 'flac' : quality === '740' ? 'ape' : 'mp3';
      const fileExtension = (() => {
        try {
          const url = new URL(audioData.url);
          const pathname = url.pathname || '';
          const match = pathname.match(/\.([a-z0-9]+)$/i);
          if (match) return match[1];
        } catch (error) { console.warn('无法从下载链接中解析扩展名:', error); }
        return preferredExtension;
      })();

      const filename = `${song.name} - ${Array.isArray(song.artist) ? song.artist.join(', ') : song.artist}.${fileExtension}`;
      const ok = await triggerDownload(downloadUrl, filename);
      if (ok) showNotification(`已开始下载: ${song.name}`, 'success');
      else throw new Error('触发下载失败');
    } else {
      throw new Error('无法获取下载地址');
    }
  } catch (error) {
    console.error('下载失败:', error);
    showNotification('下载失败，请稍后重试', 'error');
  } finally {
    if (songKey) downloadLocks.delete(songKey);
  }
}

async function downloadWithQuality(event, index, type, quality) {
  event.stopPropagation();
  const song = getSongByIndexType(index, type);
  if (!song) return;

  const songKey = song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('该歌曲正在下载中，请稍后', 'warning');
    return;
  }

  document.querySelectorAll('.quality-menu').forEach(menu => {
    menu.classList.remove('show');
    const parentItem = menu.closest('.search-result-item');
    if (parentItem) parentItem.classList.remove('menu-active');
  });

  const dynamicMenu = document.querySelector('.dynamic-quality-menu');
  if (dynamicMenu) dynamicMenu.remove();

  try {
    if (songKey) downloadLocks.add(songKey);
    await downloadSong(song, quality);
  } catch (error) {
    console.error('下载失败:', error);
    showNotification('下载失败，请稍后重试', 'error');
  } finally {
    if (songKey) downloadLocks.delete(songKey);
  }
}

// modified: enqueue to queue and poll status
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

  let pollingAbort = false;

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
    // 显示任务 id 给用户，并开始轮询
    showNotification(`已加入队列，任务ID: ${taskId}`, 'success');

    // Polling: update notification / UI
    const start = Date.now();
    const maxWaitMs = 1000 * 60 * 15; // 15 minutes

    const result = await pollDownloadStatus(taskId, { interval: 2000, timeout: maxWaitMs }, (status) => {
      // status: { id, state, progress, result }
      if (status && status.state === 'active') {
        showNotification(`下载中（队列）: ${song.name} - ${Math.min(100, status.progress || 0)}%`, 'info');
      }
    });

    if (!result.ok) {
      if (result.error === 'timeout') {
        showNotification('下载超时，请稍后到任务历史查看或重试', 'error');
      } else {
        showNotification(`下载失败: ${result.error}`, 'error');
      }
    } else {
      const final = result.result && result.result[0] ? result.result[0] : result.result; // job.finished() structure
      // Accept both {success: true, filename} or raw result
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
  }
}
