/* js/index.js — 更新：为下载操作添加防重复点击与 UI 禁用（download锁）

该文件片段包含已替换的四个函数 showQualityMenu / downloadSong / downloadWithQuality / downloadWithQualityToNas
以及全局的下载锁 (downloadLocks) 用于防止重复下载并提供用户可见的禁用状态。
*/

// 全局下载锁（按 song.id 记录正在进行的下载）
const downloadLocks = window.__downloadLocks || (window.__downloadLocks = new Set());

// 辅助：根据 (index, type) 获取 song
function getSongByIndexType(index, type) {
  if (type === "search") return state.searchResults[index];
  if (type === "online") return state.onlineSongs[index];
  if (type === "playlist") return state.playlistSongs[index];
  if (type === "favorites") return state.favoriteSongs[index];
  return null;
}

// ====== 替换的函数：showQualityMenu ======
function showQualityMenu(event, index, type) {
  event.stopPropagation();

  // 移除现有的质量菜单
  const existingMenu = document.querySelector(".dynamic-quality-menu");
  if (existingMenu) {
    existingMenu.remove();
  }

  const song = getSongByIndexType(index, type);

  // 创建新的质量菜单
  const menu = document.createElement("div");
  menu.className = "dynamic-quality-menu";
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

  // 设置菜单位置
  const button = event.target.closest("button");
  const rect = button && button.getBoundingClientRect ? button.getBoundingClientRect() : { bottom: 0, left: 0 };
  menu.style.position = "fixed";
  menu.style.top = (rect.bottom + 5) + "px";
  menu.style.left = (rect.left - 50) + "px";
  menu.style.zIndex = "10000";

  // 如果该 song 正在下载，则把所有 option 标记为禁用（不可点击）
  if (song && song.id && downloadLocks.has(String(song.id))) {
    // 添加 disabled 样式到每个 option
    setTimeout(() => {
      const options = menu.querySelectorAll('.quality-option');
      options.forEach(opt => {
        opt.classList.add('disabled');
        opt.setAttribute('aria-disabled', 'true');
      });
    }, 0);
  }

  // 绑定点击事件
  menu.addEventListener("click", (e) => {
    const option = e.target.closest(".quality-option");
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
    if (action === "download-nas") {
      downloadWithQualityToNas(event, index, type, quality);
    } else {
      downloadWithQuality(event, index, type, quality);
    }
  });

  // 添加到body
  document.body.appendChild(menu);

  // 点击其他地方关闭菜单
  setTimeout(() => {
    document.addEventListener("click", function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    });
  }, 0);
}

// ====== 替换的函数：downloadSong ======
async function downloadSong(song, quality = "320") {
  const songKey = song && song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('下载已在进行中，请勿重复操作', 'warning');
    return;
  }
  if (songKey) downloadLocks.add(songKey);

  try {
    showNotification("正在获取下载链接...");

    const audioUrl = API.getSongUrl(song, quality);
    const audioData = await API.fetchJson(audioUrl);

    if (audioData && audioData.url) {
      const proxiedAudioUrl = typeof buildAudioProxyUrl === 'function' ? buildAudioProxyUrl(audioData.url) : null;
      const preferredAudioUrl = typeof preferHttpsUrl === 'function' ? preferHttpsUrl(audioData.url) : audioData.url;

      if (proxiedAudioUrl && proxiedAudioUrl !== audioData.url) {
        debugLog && debugLog(`下载链接已通过代理转换为 HTTPS: ${proxiedAudioUrl}`);
      } else if (preferredAudioUrl !== audioData.url) {
        debugLog && debugLog(`下载链接由 HTTP 升级为 HTTPS: ${preferredAudioUrl}`);
      }

      const downloadUrl = proxiedAudioUrl || preferredAudioUrl || audioData.url;

      const link = document.createElement("a");
      link.href = downloadUrl;
      const preferredExtension =
        quality === "999" ? "flac" : quality === "740" ? "ape" : "mp3";
      const fileExtension = (() => {
        try {
          const url = new URL(audioData.url);
          const pathname = url.pathname || "";
          const match = pathname.match(/\.([a-z0-9]+)$/i);
          if (match) {
            return match[1];
          }
        } catch (error) {
          console.warn("无法从下载链接中解析扩展名:", error);
        }
        return preferredExtension;
      })();
      link.download = `${song.name} - ${Array.isArray(song.artist) ? song.artist.join(", ") : song.artist}.${fileExtension}`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`已开始下载: ${song.name}`, "success");
    } else {
      throw new Error("无法获取下载地址");
    }
  } catch (error) {
    console.error("下载失败:", error);
    showNotification("下载失败，请稍后重试", "error");
  } finally {
    if (songKey) downloadLocks.delete(songKey);
  }
}

// ====== 替换的函数：downloadWithQuality ======
async function downloadWithQuality(event, index, type, quality) {
  event.stopPropagation();
  const song = getSongByIndexType(index, type);
  if (!song) return;

  const songKey = song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('该歌曲正在下载中，请稍后', 'warning');
    return;
  }

  // 关闭菜单并移除 menu-active 类
  document.querySelectorAll(".quality-menu").forEach(menu => {
    menu.classList.remove("show");
    const parentItem = menu.closest(".search-result-item");
    if (parentItem) parentItem.classList.remove("menu-active");
  });

  // 关闭动态质量菜单
  const dynamicMenu = document.querySelector(".dynamic-quality-menu");
  if (dynamicMenu) {
    dynamicMenu.remove();
  }

  try {
    // add lock
    if (songKey) downloadLocks.add(songKey);
    await downloadSong(song, quality);
  } catch (error) {
    console.error("下载失败:", error);
    showNotification("下载失败，请稍后重试", "error");
  } finally {
    if (songKey) downloadLocks.delete(songKey);
  }
}

// ====== 新增函数：downloadWithQualityToNas ======
async function downloadWithQualityToNas(event, index, type, quality) {
  event.stopPropagation();
  const song = getSongByIndexType(index, type);
  if (!song) return;

  const songKey = song.id ? String(song.id) : null;
  if (songKey && downloadLocks.has(songKey)) {
    showNotification('该歌曲正在下载中，请稍后', 'warning');
    return;
  }

  // 关闭动态质量菜单
  const dynamicMenu = document.querySelector(".dynamic-quality-menu");
  if (dynamicMenu) {
    dynamicMenu.remove();
  }

  // add lock
  if (songKey) downloadLocks.add(songKey);

  try {
    showNotification(`正在下载到NAS: ${song.name}...`);
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song, quality })
    });
    const data = await res.json();
    if (data.success) {
      if (data.message === '文件已存在') {
        showNotification(`NAS中已存在: ${data.filename}`, "warning");
      } else {
        showNotification(`下载完成: ${data.filename}`, "success");
      }
    } else {
      showNotification(data.error || "下载到NAS失败", "error");
    }
  } catch (error) {
    console.error("下载到NAS失败:", error);
    showNotification("下载到NAS失败，请检查网络", "error");
  } finally {
    if (songKey) downloadLocks.delete(songKey);
  }
}
