/**
 * Solara Mobile UI - Apple Fluid Interfaces 物理手势与动量投射引擎
 */

import { $ } from "./core.js";
import { closeMobilePanel } from "./sheet.js";
import { closeMobileSearch } from "./search.js";

export function initBottomSheetGestures() {
    const panel = $("mobilePanel");
    const header = $("mobilePanelHeader");
    if (!panel || !header) return;

    let isDragging = false;
    let startY = 0;
    let currentY = 0;
    let initialTransformY = 0;
    let history = [];

    // Apple 经典橡皮筋非线性阻尼算法 (Rubber-Banding)
    function rubberband(overshoot, dimension = window.innerHeight, constant = 0.55) {
        return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
    }

    // 获取当前实时的物理 TranslateY
    function getComputedTranslateY(el) {
        const style = window.getComputedStyle(el);
        const matrix = style.transform || style.webkitTransform;
        if (matrix && matrix !== "none") {
            const values = matrix.split("(")[1].split(")")[0].split(",");
            if (values.length === 6) {
                return parseFloat(values[5]) || 0;
            } else if (values.length === 16) {
                return parseFloat(values[13]) || 0;
            }
        }
        return 0;
    }

    function onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // 关键：阻断按钮、输入框、分段控制器Tab栏以及顶部操作栏的手势拖拽，防止点击误捕获
        if (e.target.closest("button") || 
            e.target.closest("input") || 
            e.target.closest(".playlist-tabs") || 
            e.target.closest(".mobile-panel-actions")) {
            return;
        }

        isDragging = true;
        startY = e.clientY;
        currentY = e.clientY;
        initialTransformY = getComputedTranslateY(panel);
        history = [{ y: e.clientY, time: performance.now() }];

        try {
            panel.setPointerCapture(e.pointerId);
        } catch (err) {}

        panel.style.transition = "none";
        panel.style.willChange = "transform";
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        currentY = e.clientY;
        const deltaY = currentY - startY;

        history.push({ y: currentY, time: performance.now() });
        if (history.length > 5) {
            history.shift();
        }

        let newTranslateY = initialTransformY + deltaY;
        if (newTranslateY < 0) {
            newTranslateY = -rubberband(Math.abs(newTranslateY), 400);
        }

        panel.style.transform = `translate3d(0, ${newTranslateY}px, 0)`;

        const scrim = $("mobileOverlayScrim");
        if (scrim && newTranslateY > 0) {
            const ratio = Math.max(0, 1 - (newTranslateY / (panel.clientHeight * 0.7)));
            scrim.style.opacity = String(ratio);
        }
    }

    function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;

        try {
            panel.releasePointerCapture(e.pointerId);
        } catch (err) {}

        // 计算脱手瞬间的速度 (Velocity Handoff, px/s)
        let releaseVelocity = 0;
        if (history.length >= 2) {
            const oldest = history[0];
            const newest = history[history.length - 1];
            const dt = newest.time - oldest.time;
            if (dt > 0) {
                releaseVelocity = ((newest.y - oldest.y) / dt) * 1000;
            }
        }

        const currentPos = getComputedTranslateY(panel);
        const panelHeight = panel.clientHeight || 400;
        const totalDeltaY = currentY - startY;

        // Apple 指数衰减动量投射落点 (Momentum Projection)
        const projectedDisplacement = (releaseVelocity / 1000) * (0.998 / (1 - 0.998));
        const projectedLanding = currentPos + (projectedDisplacement * 0.05);

        panel.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        const scrim = $("mobileOverlayScrim");
        if (scrim) {
            scrim.style.transition = "opacity 0.35s ease";
            scrim.style.opacity = "";
        }

        // 关键手势门限：总位移必须大于 48px 的有效向下滑动，杜绝原地轻敲微颤被速度误杀
        const hasEffectiveDownwardDrag = totalDeltaY > 48;
        const shouldClose = hasEffectiveDownwardDrag && (
            releaseVelocity > 600 || 
            (releaseVelocity > 0 && currentPos > panelHeight * 0.35) ||
            (projectedLanding > panelHeight * 0.5)
        );

        if (shouldClose) {
            closeMobilePanel();
        } else {
            panel.style.transform = "translate3d(0, 0, 0)";
            setTimeout(() => {
                if (document.body.classList.contains("mobile-panel-open")) {
                    panel.style.transform = "";
                    panel.style.transition = "";
                }
            }, 420);
        }

        panel.style.willChange = "";
    }

    header.addEventListener("pointerdown", onPointerDown, { passive: true });
    panel.addEventListener("pointermove", onPointerMove, { passive: true });
    panel.addEventListener("pointerup", onPointerUp, { passive: true });
    panel.addEventListener("pointercancel", onPointerUp, { passive: true });
}

/**
 * 搜索面板底部药丸抓手手势与点击联动引擎
 * 支持轻点直接收起，以及向上推拽 / 向上甩动物理动量收起
 */
export function initSearchPanelGestures() {
    const searchArea = $("searchArea");
    const handle = $("mobileSearchHandle");
    if (!searchArea || !handle) return;

    let isDragging = false;
    let startY = 0;
    let currentY = 0;
    let history = [];

    // 轻点药丸直接收起
    handle.addEventListener("click", () => {
        if (!isDragging) {
            closeMobileSearch();
        }
    });

    function onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        isDragging = true;
        startY = e.clientY;
        currentY = e.clientY;
        history = [{ y: e.clientY, time: performance.now() }];

        try {
            handle.setPointerCapture(e.pointerId);
        } catch (err) {}

        searchArea.style.transition = "none";
        searchArea.style.willChange = "transform";
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        currentY = e.clientY;
        const deltaY = currentY - startY;

        history.push({ y: currentY, time: performance.now() });
        if (history.length > 5) {
            history.shift();
        }

        // 仅响应向上滑动（deltaY <= 0），向下施加极强阻尼（橡皮筋）
        let newTranslateY = deltaY;
        if (deltaY > 0) {
            newTranslateY = deltaY * 0.12;
        }

        searchArea.style.transform = `translate3d(0, ${newTranslateY}px, 0)`;
    }

    function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;

        try {
            handle.releasePointerCapture(e.pointerId);
        } catch (err) {}

        let releaseVelocity = 0; // 负数代表向上甩动
        if (history.length >= 2) {
            const oldest = history[0];
            const newest = history[history.length - 1];
            const dt = newest.time - oldest.time;
            if (dt > 0) {
                releaseVelocity = ((newest.y - oldest.y) / dt) * 1000;
            }
        }

        const totalDeltaY = currentY - startY;
        // 有效向上滑动超过 40px，或者脱手上划速度超过 400px/s 时触发收起
        const shouldClose = totalDeltaY < -40 || releaseVelocity < -400;

        searchArea.style.transition = "transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)";
        if (shouldClose) {
            searchArea.style.transform = "translate3d(0, -100%, 0)";
            setTimeout(() => {
                closeMobileSearch();
                searchArea.style.transform = "";
                searchArea.style.transition = "";
            }, 320);
        } else {
            searchArea.style.transform = "translate3d(0, 0, 0)";
            setTimeout(() => {
                searchArea.style.transform = "";
                searchArea.style.transition = "";
            }, 340);
        }
        searchArea.style.willChange = "";
    }

    handle.addEventListener("pointerdown", onPointerDown, { passive: true });
    handle.addEventListener("pointermove", onPointerMove, { passive: true });
    handle.addEventListener("pointerup", onPointerUp, { passive: true });
    handle.addEventListener("pointercancel", onPointerUp, { passive: true });
}

