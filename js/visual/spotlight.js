/**
 * Solara 视觉动效与调试支持 (Spotlight 跟随光效 & Debug Log 浮层)
 */

export function initSpotlightEffect() {
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
            const debugInfo = dom.debugInfo;
            const entry = document.createElement("div");
            entry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
            debugInfo.appendChild(entry);

            while (debugInfo.childNodes.length > 50) {
                debugInfo.removeChild(debugInfo.firstChild);
            }

            debugInfo.classList.add("show");
            debugInfo.scrollTop = debugInfo.scrollHeight;
        }
    };
}

export function initDebugShortcut(state, dom, debugLog) {
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "d") {
            e.preventDefault();
            if (state) {
                state.debugMode = !state.debugMode;
                if (state.debugMode) {
                    if (dom && dom.debugInfo) dom.debugInfo.classList.add("show");
                    if (typeof debugLog === "function") debugLog("调试模式已启用");
                } else {
                    if (dom && dom.debugInfo) dom.debugInfo.classList.remove("show");
                }
            }
        }
    });
}
