/**
 * Solara 设置面板、探索雷达偏好与大留白小播放器/全景双模态切换
 */

import { EXPLORE_RADAR_GENRES } from "../constants.js";
import { safeGetLocalStorage, safeSetLocalStorage, persistStorageItems } from "../core/storage.js";
import { toggleDebugMode } from "../visual/spotlight.js";

const NOTIFICATION_ICONS = {
    success: `<svg class="notification-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>`,
    error: `<svg class="notification-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>`,
    warning: `<svg class="notification-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>`,
    info: `<svg class="notification-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/></svg>`
};

let notificationHideTimer = null;
let notificationListenersBound = false;

export function showNotification(message, type = "success", dom = null) {
    if (typeof document === "undefined") return;
    const notification = (dom && dom.notification) || document.getElementById("notification");
    if (!notification) return;

    if (notificationHideTimer) {
        clearTimeout(notificationHideTimer);
        notificationHideTimer = null;
    }

    const iconHtml = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;
    notification.innerHTML = `
        <span class="notification-icon notification-icon--${type}" aria-hidden="true">${iconHtml}</span>
        <span class="notification-message">${message}</span>
    `;
    notification.className = `notification notification--${type} ${type}`;

    // 绑定交互：鼠标悬停暂停自动收回，移开恢复，点击直接收回
    if (!notificationListenersBound) {
        notificationListenersBound = true;
        notification.addEventListener("mouseenter", () => {
            if (notificationHideTimer) {
                clearTimeout(notificationHideTimer);
                notificationHideTimer = null;
            }
        });
        notification.addEventListener("mouseleave", () => {
            if (notification.classList.contains("show")) {
                notificationHideTimer = setTimeout(() => {
                    notification.classList.remove("show");
                    notificationHideTimer = null;
                }, 1800);
            }
        });
        notification.addEventListener("click", () => {
            if (notificationHideTimer) {
                clearTimeout(notificationHideTimer);
                notificationHideTimer = null;
            }
            notification.classList.remove("show");
        });
    }

    // 强制重绘让连续触发也有微弹性动效
    notification.classList.remove("show");
    void notification.offsetWidth;
    notification.classList.add("show");

    const displayDuration = Math.max(2800, Math.min(5500, String(message).length * 130));
    notificationHideTimer = setTimeout(() => {
        notification.classList.remove("show");
        notificationHideTimer = null;
    }, displayDuration);
}

export function openSettingsModal(dom, state = null) {
    if (dom && dom.settingsModal) {
        // 同步调试模式按钮外观
        if (state) {
            const toggleDebugBtn = document.getElementById("toggleDebugBtn");
            const toggleDebugText = document.getElementById("toggleDebugText");
            if (toggleDebugBtn) {
                toggleDebugBtn.classList.toggle("is-active", Boolean(state.debugMode));
            }
            if (toggleDebugText) {
                toggleDebugText.textContent = state.debugMode ? "关闭调试模式" : "开启调试模式";
            }
        }
        dom.settingsModal.classList.add("show");
        dom.settingsModal.setAttribute("aria-hidden", "false");
    }
}

export function closeSettingsModal(dom) {
    if (dom && dom.settingsModal) {
        dom.settingsModal.classList.remove("show");
        dom.settingsModal.setAttribute("aria-hidden", "true");
    }
}

export function renderGenreList(dom) {
    if (!dom || !dom.radarGenreList) return;
    
    dom.radarGenreList.innerHTML = EXPLORE_RADAR_GENRES.map(genre => `
        <div class="genre-item">
            <input type="checkbox" id="genre-${genre}" value="${genre}" checked>
            <label for="genre-${genre}" class="genre-label">${genre}</label>
        </div>
    `).join("");
}

export function applySettingsToUI(dom, state) {
    if (!state.radarSettings || !state.radarSettings.genres || !dom.radarGenreList) return;
    
    const checkboxes = dom.radarGenreList.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(cb => {
        cb.checked = state.radarSettings.genres.includes(cb.value);
    });
}

export async function loadSettings(dom, state) {
    let localSettings = safeGetLocalStorage("radarSettings");
    if (localSettings) {
        try {
            state.radarSettings = JSON.parse(localSettings);
            applySettingsToUI(dom, state);
        } catch (e) {
            console.error("解析本地设置失败:", e);
        }
    }
}

export async function saveSettings(dom, state) {
    if (!dom.radarGenreList) return;
    const selectedGenres = Array.from(dom.radarGenreList.querySelectorAll("input:checked")).map(cb => cb.value);
    
    if (selectedGenres.length === 0) {
        showNotification("请至少选择一个风格", "warning", dom);
        return;
    }

    state.radarSettings = {
        genres: selectedGenres
    };

    safeSetLocalStorage("radarSettings", JSON.stringify(state.radarSettings));

    if (typeof persistStorageItems === "function") {
        persistStorageItems({
            radarSettings: JSON.stringify(state.radarSettings)
        });
    }

    showNotification("设置已保存", "success", dom);
    closeSettingsModal(dom);
}

export function initLayoutMode(dom) {
    const STORAGE_KEY = "solara_layout_mode";
    const toggleBtn = dom?.layoutToggleBtn || document.getElementById("layoutToggleBtn");
    
    let currentMode = localStorage.getItem(STORAGE_KEY);
    if (!currentMode) {
        currentMode = "compact";
    }

    const applyLayoutMode = (mode) => {
        const isCompact = mode === "compact";
        document.body.classList.toggle("layout-compact", isCompact);
        
        if (toggleBtn) {
            toggleBtn.setAttribute("aria-label", isCompact ? "展开为全景沉浸模式" : "收拢为大留白小播放器");
            toggleBtn.setAttribute("title", isCompact ? "展开为全景沉浸模式（双击Logo打开设置）" : "收拢为大留白小播放器（双击Logo打开设置）");
        }
        localStorage.setItem(STORAGE_KEY, mode);
    };

    applyLayoutMode(currentMode);

    if (toggleBtn && !toggleBtn.__layoutBound) {
        toggleBtn.__layoutBound = true;
        toggleBtn.addEventListener("click", () => {
            const isCurrentlyCompact = document.body.classList.contains("layout-compact");
            const newMode = isCurrentlyCompact ? "expanded" : "compact";
            applyLayoutMode(newMode);
        });
    }

    const brand = dom?.brandWrap || document.querySelector(".header-brand-wrap");
    if (brand && !brand.__dblBound) {
        brand.__dblBound = true;
        brand.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openSettingsModal(dom);
        });
    }

    if (!window.__settingsKeyBound) {
        window.__settingsKeyBound = true;
        window.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ",") {
                e.preventDefault();
                openSettingsModal(dom);
            }
        });
    }
}

export function initSettings(dom, state, callbacks = {}) {
    renderGenreList(dom);

    if (dom.logo) {
        dom.logo.addEventListener("dblclick", () => openSettingsModal(dom, state));
    }
    
    let lastToolbarClick = 0;
    const handleDoubleTap = (e) => {
        const now = Date.now();
        if (now - lastToolbarClick < 300) {
            e.preventDefault();
            openSettingsModal(dom, state);
        }
        lastToolbarClick = now;
    };

    if (dom.mobileToolbarTitle) {
        dom.mobileToolbarTitle.addEventListener("click", handleDoubleTap);
    }

    if (dom.closeSettingsBtn) {
        dom.closeSettingsBtn.addEventListener("click", () => closeSettingsModal(dom));
    }
    if (dom.saveSettingsBtn) {
        dom.saveSettingsBtn.addEventListener("click", () => saveSettings(dom, state));
    }
    const openBtn = dom.openSettingsBtn || document.getElementById("openSettingsBtn");
    if (openBtn) {
        openBtn.addEventListener("click", () => openSettingsModal(dom, state));
    }
    if (dom.settingsModal) {
        dom.settingsModal.addEventListener("click", (e) => {
            if (e.target === dom.settingsModal) closeSettingsModal(dom);
        });
    }

    // 绑定开启/关闭调试模式按钮
    const toggleDebugBtn = document.getElementById("toggleDebugBtn");
    if (toggleDebugBtn) {
        toggleDebugBtn.addEventListener("click", () => {
            const isEnabled = toggleDebugMode(state, dom, callbacks.debugLog);
            showNotification(isEnabled ? "已开启调试控制台" : "已关闭调试控制台", isEnabled ? "success" : "info", dom);
        });
    }

    // 绑定手动云端同步按钮
    const manualSyncBtn = document.getElementById("manualSyncBtn");
    if (manualSyncBtn) {
        manualSyncBtn.addEventListener("click", async () => {
            if (typeof callbacks.manualSync === "function") {
                manualSyncBtn.disabled = true;
                const origHtml = manualSyncBtn.innerHTML;
                manualSyncBtn.innerHTML = '<span class="loader" style="width:14px;height:14px;border-width:2px;"></span><span>正在同步中...</span>';
                try {
                    await callbacks.manualSync();
                    showNotification("云端数据漫游同步成功", "success", dom);
                } catch (e) {
                    console.error("手动同步失败:", e);
                    showNotification(e.message ? `同步失败: ${e.message}` : "云端同步失败，请检查网络或服务端", "error", dom);
                } finally {
                    manualSyncBtn.disabled = false;
                    manualSyncBtn.innerHTML = origHtml;
                }
            } else {
                console.warn("未提供 manualSync 回调函数");
            }
        });
    }

    loadSettings(dom, state);
    initLayoutMode(dom);
}
