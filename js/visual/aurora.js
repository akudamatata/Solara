/**
 * Solara Apple Music 极光流体舞台与动态材质渐变渲染引擎
 */

import {
    BACKGROUND_TRANSITION_DURATION,
    PALETTE_APPLY_DELAY,
    themeDefaults,
    PLACEHOLDER_HTML
} from "../constants.js";
import {
    preferHttpsUrl,
    toAbsoluteUrl,
    safeGetLocalStorage,
    safeSetLocalStorage
} from "../core/storage.js";
import {
    paletteCache,
    persistPaletteCache,
    fetchPaletteData,
    extractPaletteFromCanvas
} from "./palette.js";

let paletteAbortController = null;
let backgroundTransitionTimer = null;
let pendingPaletteTimer = null;
let deferredPaletteHandle = null;
let deferredPaletteType = "";
let deferredPaletteUrl = null;
let paletteRequestId = 0;

export function setGlobalThemeProperty(name, value) {
    if (typeof name !== "string") {
        return;
    }
    document.documentElement.style.setProperty(name, value);
    if (document.body) {
        document.body.style.setProperty(name, value);
    }
}

export function removeGlobalThemeProperty(name) {
    if (typeof name !== "string") {
        return;
    }
    document.documentElement.style.removeProperty(name);
    if (document.body) {
        document.body.style.removeProperty(name);
    }
}

export function captureThemeDefaults(state) {
    if (state.themeDefaultsCaptured) {
        return;
    }

    const initialIsDark = document.body.classList.contains("dark-mode");
    document.body.classList.remove("dark-mode");

    const oldBg = document.documentElement.style.getPropertyValue("--bg-gradient");
    const oldPrimary = document.documentElement.style.getPropertyValue("--primary-color");
    const oldPrimaryDark = document.documentElement.style.getPropertyValue("--primary-color-dark");
    
    document.documentElement.style.removeProperty("--bg-gradient");
    document.documentElement.style.removeProperty("--primary-color");
    document.documentElement.style.removeProperty("--primary-color-dark");

    const lightStyles = getComputedStyle(document.body);
    themeDefaults.light.gradient = lightStyles.getPropertyValue("--bg-gradient").trim();
    themeDefaults.light.primaryColor = lightStyles.getPropertyValue("--primary-color").trim();
    themeDefaults.light.primaryColorDark = lightStyles.getPropertyValue("--primary-color-dark").trim();

    document.body.classList.add("dark-mode");
    const darkStyles = getComputedStyle(document.body);
    themeDefaults.dark.gradient = darkStyles.getPropertyValue("--bg-gradient").trim();
    themeDefaults.dark.primaryColor = darkStyles.getPropertyValue("--primary-color").trim();
    themeDefaults.dark.primaryColorDark = darkStyles.getPropertyValue("--primary-color-dark").trim();

    if (!initialIsDark) {
        document.body.classList.remove("dark-mode");
    }

    if (oldBg) document.documentElement.style.setProperty("--bg-gradient", oldBg);
    if (oldPrimary) document.documentElement.style.setProperty("--primary-color", oldPrimary);
    if (oldPrimaryDark) document.documentElement.style.setProperty("--primary-color-dark", oldPrimaryDark);

    state.themeDefaultsCaptured = true;
}

export function applyThemeTokens(tokens) {
    if (!tokens) return;
    if (tokens.primaryColor) {
        setGlobalThemeProperty("--primary-color", tokens.primaryColor);
    }
    if (tokens.primaryColorDark) {
        setGlobalThemeProperty("--primary-color-dark", tokens.primaryColorDark);
    }
}

export function setDocumentGradient(gradient, state, dom, { immediate = false } = {}) {
    const normalized = (gradient || "").trim();
    const current = (state.currentGradient || "").trim();
    const shouldSkipTransition = immediate || normalized === current;

    if (!dom.backgroundTransitionLayer || !dom.backgroundBaseLayer) {
        if (normalized) {
            setGlobalThemeProperty("--bg-gradient", normalized);
            setGlobalThemeProperty("--bg-gradient-next", normalized);
        } else {
            removeGlobalThemeProperty("--bg-gradient");
            removeGlobalThemeProperty("--bg-gradient-next");
        }
        state.currentGradient = normalized;
        return;
    }

    window.clearTimeout(backgroundTransitionTimer);

    if (shouldSkipTransition) {
        if (normalized) {
            setGlobalThemeProperty("--bg-gradient", normalized);
            setGlobalThemeProperty("--bg-gradient-next", normalized);
        } else {
            removeGlobalThemeProperty("--bg-gradient");
            removeGlobalThemeProperty("--bg-gradient-next");
        }
        document.body.classList.remove("background-transitioning");
        state.currentGradient = normalized;
        return;
    }

    if (normalized) {
        setGlobalThemeProperty("--bg-gradient-next", normalized);
    } else {
        removeGlobalThemeProperty("--bg-gradient-next");
    }

    requestAnimationFrame(() => {
        document.body.classList.add("background-transitioning");
        backgroundTransitionTimer = window.setTimeout(() => {
            if (normalized) {
                setGlobalThemeProperty("--bg-gradient", normalized);
                setGlobalThemeProperty("--bg-gradient-next", normalized);
            } else {
                removeGlobalThemeProperty("--bg-gradient");
                removeGlobalThemeProperty("--bg-gradient-next");
            }
            document.body.classList.remove("background-transitioning");
            state.currentGradient = normalized;
        }, BACKGROUND_TRANSITION_DURATION);
    });
}

export function applyDynamicGradient(state, dom, options = {}) {
    if (!state.themeDefaultsCaptured) {
        captureThemeDefaults(state);
    }
    const isDark = document.body.classList.contains("dark-mode");
    const mode = isDark ? "dark" : "light";
    const defaults = themeDefaults[mode];
    const immediate = Boolean(options.immediate);

    let targetGradient = defaults.gradient || "";
    let targetColors = isDark
        ? ["#0e3029", "#164e43", "#1a6b5c", "#0b1d19", "#34d1b6"]
        : ["#4a90e2", "#50e3c2", "#b8e986", "#7b92b2", "#1abc9c"];
    let targetTokens = defaults;

    const palette = state.dynamicPalette;
    if (palette && palette.gradients) {
        const gradients = palette.gradients;
        let gradientMode = mode;
        let gradientInfo = gradients[gradientMode] || null;

        if (!gradientInfo) {
            const fallbackModes = gradientMode === "dark" ? ["light"] : ["dark"];
            for (const candidate of fallbackModes) {
                if (gradients[candidate]) {
                    gradientMode = candidate;
                    gradientInfo = gradients[candidate];
                    break;
                }
            }
            if (!gradientInfo) {
                const availableModes = Object.keys(gradients);
                if (availableModes.length) {
                    const candidate = availableModes[0];
                    gradientMode = candidate;
                    gradientInfo = gradients[candidate];
                }
            }
        }

        if (gradientInfo && gradientInfo.gradient) {
            targetGradient = gradientInfo.gradient;
        }

        if (gradientInfo && Array.isArray(gradientInfo.colors) && gradientInfo.colors.length >= 3) {
            const colors = gradientInfo.colors;
            const accent = palette.accentColor || palette.baseColor || colors[0];
            targetColors = [
                colors[0],
                colors[1],
                colors[2],
                palette.averageColor || colors[0],
                accent
            ];
        }

        if (palette.tokens) {
            targetTokens = palette.tokens[gradientMode] || palette.tokens[mode] || defaults;
        }
    }

    const applyGlobalColorsAndTokens = () => {
        setGlobalThemeProperty("--palette-c1", targetColors[0]);
        setGlobalThemeProperty("--palette-c2", targetColors[1]);
        setGlobalThemeProperty("--palette-c3", targetColors[2]);
        setGlobalThemeProperty("--palette-c4", targetColors[3]);
        setGlobalThemeProperty("--palette-accent", targetColors[4]);
        setGlobalThemeProperty("--palette-glow", `${targetColors[4]}66`);
        applyThemeTokens(targetTokens);
    };

    if (immediate || !dom.backgroundTransitionLayer || !dom.backgroundBaseLayer) {
        window.clearTimeout(backgroundTransitionTimer);
        document.body.classList.remove("background-transitioning");
        if (dom.backgroundTransitionLayer) {
            dom.backgroundTransitionLayer.removeAttribute("style");
        }
        applyGlobalColorsAndTokens();
        if (targetGradient) {
            setGlobalThemeProperty("--bg-gradient", targetGradient);
            setGlobalThemeProperty("--bg-gradient-next", targetGradient);
        } else {
            removeGlobalThemeProperty("--bg-gradient");
            removeGlobalThemeProperty("--bg-gradient-next");
        }
        state.currentGradient = targetGradient;
        return;
    }

    // 渐变已完全相同时无需触发过渡
    const current = (state.currentGradient || "").trim();
    if (targetGradient && targetGradient === current) {
        applyGlobalColorsAndTokens();
        return;
    }

    window.clearTimeout(backgroundTransitionTimer);

    // 1. 将新调色板与渐变作用于过渡层自身（图层变量隔离，底层色球与渐变保持原样不变，彻底杜绝突变与两段式跳跃）
    dom.backgroundTransitionLayer.style.setProperty("--palette-c1", targetColors[0]);
    dom.backgroundTransitionLayer.style.setProperty("--palette-c2", targetColors[1]);
    dom.backgroundTransitionLayer.style.setProperty("--palette-c3", targetColors[2]);
    dom.backgroundTransitionLayer.style.setProperty("--palette-c4", targetColors[3]);
    dom.backgroundTransitionLayer.style.setProperty("--palette-accent", targetColors[4]);
    dom.backgroundTransitionLayer.style.setProperty("--palette-glow", `${targetColors[4]}66`);
    setGlobalThemeProperty("--bg-gradient-next", targetGradient);

    // 2. 下一帧激活平滑淡入
    requestAnimationFrame(() => {
        document.body.classList.add("background-transitioning");

        // 3. 过渡完成时，同步至全局并无缝交接，移除过渡态
        backgroundTransitionTimer = window.setTimeout(() => {
            applyGlobalColorsAndTokens();
            if (targetGradient) {
                setGlobalThemeProperty("--bg-gradient", targetGradient);
                setGlobalThemeProperty("--bg-gradient-next", targetGradient);
            } else {
                removeGlobalThemeProperty("--bg-gradient");
                removeGlobalThemeProperty("--bg-gradient-next");
            }
            if (dom.backgroundTransitionLayer) {
                dom.backgroundTransitionLayer.removeAttribute("style");
            }
            document.body.classList.remove("background-transitioning");
            state.currentGradient = targetGradient;
        }, BACKGROUND_TRANSITION_DURATION);
    });
}

export function cancelDeferredPaletteUpdate() {
    if (deferredPaletteHandle === null) {
        return;
    }
    if (deferredPaletteType === "idle" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(deferredPaletteHandle);
    } else {
        window.clearTimeout(deferredPaletteHandle);
    }
    deferredPaletteHandle = null;
    deferredPaletteType = "";
    deferredPaletteUrl = null;
}

export function attemptPaletteApplication(state, dom) {
    if (!state.pendingPaletteReady || !state.audioReadyForPalette) {
        return;
    }

    const palette = state.pendingPaletteData || null;
    const imageUrl = state.pendingPaletteImage || null;
    const immediate = state.pendingPaletteImmediate;

    state.pendingPaletteData = null;
    state.pendingPaletteImage = null;
    state.pendingPaletteImmediate = false;
    state.pendingPaletteReady = false;

    // 调色板就绪后立即执行单步平滑渐变，去除冗余的 PALETTE_APPLY_DELAY 延迟
    state.dynamicPalette = palette;
    state.currentPaletteImage = imageUrl;
    applyDynamicGradient(state, dom, { immediate });
}

export function queuePaletteApplication(palette, imageUrl, state, dom, options = {}) {
    window.clearTimeout(pendingPaletteTimer);
    pendingPaletteTimer = null;
    state.pendingPaletteData = palette || null;
    state.pendingPaletteImage = imageUrl || null;
    state.pendingPaletteImmediate = Boolean(options.immediate);
    state.pendingPaletteReady = true;
    attemptPaletteApplication(state, dom);
}

export function queueDefaultPalette(state, dom, options = {}) {
    window.clearTimeout(pendingPaletteTimer);
    pendingPaletteTimer = null;
    cancelDeferredPaletteUpdate();
    state.pendingPaletteData = null;
    state.pendingPaletteImage = null;
    state.pendingPaletteImmediate = Boolean(options.immediate);
    state.pendingPaletteReady = true;
    attemptPaletteApplication(state, dom);
}

export function resetDynamicBackground(state, dom, options = {}) {
    paletteRequestId += 1;
    cancelDeferredPaletteUpdate();
    if (paletteAbortController) {
        paletteAbortController.abort();
        paletteAbortController = null;
    }
    state.dynamicPalette = null;
    state.currentPaletteImage = null;
    queueDefaultPalette(state, dom, options);
}

export async function updateDynamicBackground(imageUrl, state, dom, debugLogger = null) {
    paletteRequestId += 1;
    const requestId = paletteRequestId;

    if (!imageUrl) {
        resetDynamicBackground(state, dom);
        return;
    }

    if (typeof debugLogger === "function") debugLogger(`动态背景: 更新至新的图片 ${imageUrl}`);

    if (paletteAbortController) {
        paletteAbortController.abort();
        paletteAbortController = null;
    }

    if (paletteCache.has(imageUrl)) {
        const cached = paletteCache.get(imageUrl);
        paletteCache.delete(imageUrl);
        paletteCache.set(imageUrl, cached);
        queuePaletteApplication(cached, imageUrl, state, dom);
        if (typeof debugLogger === "function") debugLogger("[本地缓存] 动态背景提取成功");
        return;
    }

    if (state.currentPaletteImage === imageUrl && state.dynamicPalette) {
        queuePaletteApplication(state.dynamicPalette, imageUrl, state, dom);
        if (typeof debugLogger === "function") debugLogger("[内存复用] 动态背景提取成功");
        return;
    }

    let controller = null;
    try {
        if (paletteAbortController) {
            paletteAbortController.abort();
        }

        controller = new AbortController();
        paletteAbortController = controller;

        const palette = await fetchPaletteData(imageUrl, controller.signal);
        if (requestId !== paletteRequestId) {
            return;
        }
        queuePaletteApplication(palette, imageUrl, state, dom);
        if (typeof debugLogger === "function") debugLogger("[后端解析] 动态背景提取成功");
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }

        console.warn(`[Palette ERROR] Backend extraction failed:`, error);
        if (typeof debugLogger === "function") debugLogger("[后端解析] 失败，尝试前端降级");

        try {
            const clientPalette = await extractPaletteFromCanvas(imageUrl);
            if (requestId !== paletteRequestId) {
                return;
            }

            if (paletteCache.has(imageUrl)) {
                paletteCache.delete(imageUrl);
            }
            paletteCache.set(imageUrl, clientPalette);
            persistPaletteCache();

            queuePaletteApplication(clientPalette, imageUrl, state, dom);
            if (typeof debugLogger === "function") debugLogger("[前端降级] 动态背景提取成功");
        } catch (fallbackError) {
            console.warn("客户端降级提取也失败了:", fallbackError);
            if (typeof debugLogger === "function") debugLogger(`[前端降级] 失败: 使用默认背景`);
            if (requestId === paletteRequestId) {
                resetDynamicBackground(state, dom);
            }
        }
    } finally {
        if (controller && paletteAbortController === controller) {
            paletteAbortController = null;
        }
    }
}

export function scheduleDeferredPaletteUpdate(imageUrl, state, dom, options = {}, debugLogger = null) {
    const immediate = Boolean(options.immediate);
    if (!imageUrl) {
        cancelDeferredPaletteUpdate();
        if (immediate) {
            resetDynamicBackground(state, dom);
        }
        return;
    }

    if (immediate) {
        cancelDeferredPaletteUpdate();
        updateDynamicBackground(imageUrl, state, dom, debugLogger);
        return;
    }

    if (deferredPaletteHandle !== null) {
        if (deferredPaletteType === "idle" && typeof window.cancelIdleCallback === "function") {
            window.cancelIdleCallback(deferredPaletteHandle);
        } else {
            window.clearTimeout(deferredPaletteHandle);
        }
    }

    deferredPaletteUrl = imageUrl;
    const runner = () => {
        deferredPaletteHandle = null;
        deferredPaletteType = "";
        const targetUrl = deferredPaletteUrl;
        deferredPaletteUrl = null;
        if (targetUrl) {
            updateDynamicBackground(targetUrl, state, dom, debugLogger);
        }
    };

    if (typeof window.requestIdleCallback === "function") {
        deferredPaletteType = "idle";
        deferredPaletteHandle = window.requestIdleCallback(runner, { timeout: 800 });
    } else {
        deferredPaletteType = "timeout";
        deferredPaletteHandle = window.setTimeout(runner, 120);
    }
}

export function showAlbumCoverPlaceholder(dom, state) {
    dom.albumCover.innerHTML = PLACEHOLDER_HTML;
    dom.albumCover.classList.remove("loading");
    state.currentArtworkUrl = toAbsoluteUrl('/favicon.png');
    queueDefaultPalette(state, dom);
    if (typeof window.__SOLARA_UPDATE_MEDIA_METADATA === 'function') {
        window.__SOLARA_UPDATE_MEDIA_METADATA();
    }
}

export function setAlbumCoverImage(url, dom, state) {
    const safeUrl = toAbsoluteUrl(preferHttpsUrl(url));
    state.currentArtworkUrl = safeUrl;
    dom.albumCover.innerHTML = `<img src="${safeUrl}" alt="专辑封面">`;
    dom.albumCover.classList.remove("loading");
    if (typeof window.__SOLARA_UPDATE_MEDIA_METADATA === 'function') {
        window.__SOLARA_UPDATE_MEDIA_METADATA();
    }
}

export function initTheme(dom, state) {
    function applyTheme(isDark) {
        if (!state.themeDefaultsCaptured) {
            captureThemeDefaults(state);
        }
        document.body.classList.toggle("dark-mode", isDark);
        if (dom.themeToggleButton) {
            dom.themeToggleButton.classList.toggle("is-dark", isDark);
            const label = isDark ? "切换为浅色模式" : "切换为深色模式";
            dom.themeToggleButton.setAttribute("aria-label", label);
            dom.themeToggleButton.setAttribute("title", label);
        }
        applyDynamicGradient(state, dom, { immediate: true });
    }

    captureThemeDefaults(state);
    const savedTheme = safeGetLocalStorage("theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialIsDark = savedTheme ? savedTheme === "dark" : prefersDark;
    applyTheme(initialIsDark);

    if (dom.themeToggleButton && !dom.themeToggleButton.__themeBound) {
        dom.themeToggleButton.__themeBound = true;
        dom.themeToggleButton.addEventListener("click", () => {
            const isDark = !document.body.classList.contains("dark-mode");
            applyTheme(isDark);
            safeSetLocalStorage("theme", isDark ? "dark" : "light");
        });
    }
}
