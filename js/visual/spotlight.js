/**
 * Solara 视觉动效与调试支持 (Spotlight 跟随光效 & Debug Log 浮层)
 */

export function initSpotlightEffect() {
    // 移动设备触屏操作无需鼠标跟随聚光灯效果，避免无谓的重排计算与能耗
    if (window.__SOLARA_IS_MOBILE || document.documentElement.classList.contains("mobile-view")) {
        return;
    }

    let ticking = false;
    window.addEventListener("mousemove", (e) => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const elements = document.querySelectorAll(".spotlight-card, .container");
                elements.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    el.style.setProperty("--mouse-x", `${x}px`);
                    el.style.setProperty("--mouse-y", `${y}px`);
                });
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

export function createDebugLogger(state, dom) {
    return function debugLog(message) {
        console.log(`[DEBUG] ${message}`);
        if (state && state.debugMode && dom && dom.debugInfo) {
            const container = document.getElementById("debugInfoContent") || dom.debugInfo;
            const entry = document.createElement("div");
            entry.className = "debug-info-entry";
            entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
            container.appendChild(entry);

            while (container.childNodes.length > 80) {
                container.removeChild(container.firstChild);
            }

            dom.debugInfo.classList.add("show");
            container.scrollTop = container.scrollHeight;
        }
    };
}

export function toggleDebugMode(state, dom, debugLog = null) {
    if (!state) return false;
    state.debugMode = !state.debugMode;
    const isEnabled = Boolean(state.debugMode);

    if (dom && dom.debugInfo) {
        if (isEnabled) {
            dom.debugInfo.classList.add("show");
            if (typeof debugLog === "function") {
                debugLog(`调试模式已启用 (设备: ${window.__SOLARA_IS_MOBILE ? "移动端" : "桌面端"})`);
            }
        } else {
            dom.debugInfo.classList.remove("show");
        }
    }

    // 更新设置模态框中切换按钮的文案与激活样式
    const toggleDebugBtn = document.getElementById("toggleDebugBtn");
    const toggleDebugText = document.getElementById("toggleDebugText");
    if (toggleDebugBtn) {
        toggleDebugBtn.classList.toggle("is-active", isEnabled);
    }
    if (toggleDebugText) {
        toggleDebugText.textContent = isEnabled ? "关闭调试模式" : "开启调试模式";
    }

    return isEnabled;
}

export function initDebugShortcut(state, dom, debugLog) {
    // 快捷键 Ctrl+D 开启/关闭
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "d") {
            e.preventDefault();
            toggleDebugMode(state, dom, debugLog);
        }
    });

    // 绑定调试控制台右上角工具按钮
    const clearBtn = document.getElementById("clearDebugLogBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            const container = document.getElementById("debugInfoContent") || dom.debugInfo;
            if (container) container.innerHTML = "";
        });
    }

    const closeBtn = document.getElementById("closeDebugLogBtn");
    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            toggleDebugMode(state, dom, debugLog);
        });
    }
}
