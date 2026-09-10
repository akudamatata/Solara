/**
 * Solara Mobile UI - 核心基础工具
 */

// 安全获取 DOM 元素，杜绝模块加载时序问题
export function $(id) {
    return document.getElementById(id);
}

// 触觉微脉冲反馈 (Haptic micro-pulse)
export function triggerLightHaptic() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
            navigator.vibrate(8);
        } catch (e) {
            // 忽略静音环境下的震动阻断
        }
    }
}

// 遮罩层状态协同
export function updateMobileOverlayScrim() {
    const scrim = $("mobileOverlayScrim");
    if (!scrim || !document.body) {
        return;
    }
    const hasOverlay = document.body.classList.contains("mobile-search-open") ||
        document.body.classList.contains("mobile-panel-open");
    scrim.setAttribute("aria-hidden", hasOverlay ? "false" : "true");
}
