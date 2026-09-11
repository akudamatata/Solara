/**
 * Solara Mobile UI - 封面与全景沉浸极光歌词流切换及物理交互控制器
 */

import { $, triggerLightHaptic } from "./core.js";
import { scrollToCurrentLyric } from "../features/lyrics.js";

let userScrollTimeout = null;

export function toggleMobileLyrics(forceState = null) {
    if (!document.body) return;
    const willOpen = typeof forceState === "boolean" 
        ? forceState 
        : !document.body.classList.contains("mobile-inline-lyrics-open");

    triggerLightHaptic();
    document.body.classList.toggle("mobile-inline-lyrics-open", willOpen);

    const appState = window.SolaraState;
    if (appState) {
        appState.isMobileInlineLyricsOpen = willOpen;
        if (willOpen) {
            appState.userScrolledLyrics = false;
            if (userScrollTimeout) {
                clearTimeout(userScrollTimeout);
                userScrollTimeout = null;
            }
        }
    }

    const lyricsContainer = $("mobileInlineLyrics");
    if (lyricsContainer) {
        lyricsContainer.style.transform = "";
        lyricsContainer.style.transition = "";
    }

    if (willOpen) {
        const lyricsScroll = $("mobileInlineLyricsScroll");
        const lyricsContent = $("mobileInlineLyricsContent");
        const dom = window.SolaraDOM;

        const alignCurrentLyric = (smooth = false) => {
            const currentLyric = lyricsContent?.querySelector(".current");
            if (currentLyric && lyricsScroll) {
                scrollToCurrentLyric(currentLyric, lyricsScroll, dom, smooth);
            }
        };

        // 彻底弃用有兼容隐患的 scrollIntoView，改用精准视口居中计算
        // 首帧先无动画即时居中，待入场动画稳定后再次轻量对齐
        window.requestAnimationFrame(() => {
            alignCurrentLyric(false);
            window.setTimeout(() => {
                alignCurrentLyric(false);
            }, 60);
            window.setTimeout(() => {
                alignCurrentLyric(true);
            }, 300);
        });
    }
}

/**
 * 初始化沉浸极光歌词舞台交互（下拉手势收起、点词即播、防打扰智能滚动）
 */
export function initMobileLyricsInteractions() {
    const lyricsContainer = $("mobileInlineLyrics");
    const lyricsHeader = $("mobileInlineLyricsHeader");
    const lyricsScroll = $("mobileInlineLyricsScroll");
    const lyricsContent = $("mobileInlineLyricsContent");

    if (!lyricsContainer) return;

    // 1. 点击顶部 Header（药丸 Handle + 提示胶囊）返回封面
    if (lyricsHeader) {
        lyricsHeader.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMobileLyrics(false);
        });
    }

    // 2. 点词即播 (Interactive Lyric Tap-to-Seek)
    if (lyricsContent) {
        lyricsContent.addEventListener("click", (e) => {
            const targetLine = e.target.closest("div[data-time]");
            if (!targetLine) return;

            const timeStr = targetLine.getAttribute("data-time");
            const targetTime = parseFloat(timeStr);
            if (!isNaN(targetTime)) {
                const state = window.SolaraState;
                if (state) {
                    state.userScrolledLyrics = false;
                }
                if (userScrollTimeout) {
                    clearTimeout(userScrollTimeout);
                    userScrollTimeout = null;
                }

                const audioPlayer = window.SolaraDOM?.audioPlayer || $("audioPlayer");
                if (audioPlayer) {
                    audioPlayer.currentTime = targetTime;
                    if (audioPlayer.paused) {
                        audioPlayer.play().catch(() => {});
                    }
                    triggerLightHaptic();
                }
            }
        });
    }

    // 3. 用户手动滑动防打扰机制（用户滚屏时暂停自动跟随，5s 无操作后平滑复位）
    if (lyricsScroll) {
        let isTouching = false;

        const scheduleRecenter = () => {
            if (userScrollTimeout) {
                clearTimeout(userScrollTimeout);
            }
            userScrollTimeout = setTimeout(() => {
                const state = window.SolaraState;
                if (state) {
                    state.userScrolledLyrics = false;
                }
                const currentLyric = lyricsContent?.querySelector(".current");
                if (currentLyric && lyricsScroll) {
                    scrollToCurrentLyric(currentLyric, lyricsScroll, window.SolaraDOM, true);
                }
            }, 5000);
        };

        lyricsScroll.addEventListener("touchstart", () => {
            isTouching = true;
            const state = window.SolaraState;
            if (state) {
                state.userScrolledLyrics = true;
            }
            if (userScrollTimeout) {
                clearTimeout(userScrollTimeout);
                userScrollTimeout = null;
            }
        }, { passive: true });

        lyricsScroll.addEventListener("touchend", () => {
            isTouching = false;
            scheduleRecenter();
        }, { passive: true });

        lyricsScroll.addEventListener("touchcancel", () => {
            isTouching = false;
            scheduleRecenter();
        }, { passive: true });

        lyricsScroll.addEventListener("wheel", () => {
            const state = window.SolaraState;
            if (state) {
                state.userScrolledLyrics = true;
            }
            scheduleRecenter();
        }, { passive: true });

        lyricsScroll.addEventListener("scroll", () => {
            // 忽略程序触发的平滑滚动
            if (window.__solaraIsProgrammaticScrolling) return;

            const state = window.SolaraState;
            if (!state) return;
            state.userScrolledLyrics = true;

            if (!isTouching) {
                scheduleRecenter();
            }
        }, { passive: true });
    }

    // 4. Apple 原生级下拉收起手势 (Pull-down to Dismiss)
    let startY = 0;
    let currentDeltaY = 0;
    let isDragging = false;

    lyricsContainer.addEventListener("touchstart", (e) => {
        if (!document.body.classList.contains("mobile-inline-lyrics-open")) return;
        
        // 判定触控区域：碰触顶部 header 区域（Handle/胶囊），或歌词内容滚至最顶部 (scrollTop <= 4)
        const isScrollAtTop = !lyricsScroll || lyricsScroll.scrollTop <= 4;
        const isHeaderTouch = lyricsHeader && (lyricsHeader === e.target || lyricsHeader.contains(e.target));

        if (isScrollAtTop || isHeaderTouch) {
            startY = e.touches[0].clientY;
            currentDeltaY = 0;
            isDragging = true;
            lyricsContainer.style.transition = "none";
        }
    }, { passive: true });

    lyricsContainer.addEventListener("touchmove", (e) => {
        if (!isDragging) return;

        const touchY = e.touches[0].clientY;
        const deltaY = touchY - startY;

        // 仅处理向下位移（下拉手势）
        if (deltaY > 0) {
            currentDeltaY = deltaY;
            // 物理橡皮筋阻尼跟随
            const dampedY = Math.pow(deltaY, 0.86);
            lyricsContainer.style.transform = `translateY(${dampedY}px)`;
            lyricsContainer.style.opacity = Math.max(0.6, 1 - (deltaY / 300)).toString();
        } else {
            currentDeltaY = 0;
            lyricsContainer.style.transform = "";
            lyricsContainer.style.opacity = "";
        }
    }, { passive: true });

    const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        lyricsContainer.style.transition = "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.32s ease";

        // 下拉位移超过 45px 时即触发收起，否则弹性平滑归位
        if (currentDeltaY > 45) {
            lyricsContainer.style.transform = "translateY(100px)";
            lyricsContainer.style.opacity = "0";
            setTimeout(() => {
                toggleMobileLyrics(false);
                lyricsContainer.style.transform = "";
                lyricsContainer.style.opacity = "";
                lyricsContainer.style.transition = "";
            }, 180);
        } else {
            lyricsContainer.style.transform = "";
            lyricsContainer.style.opacity = "";
            setTimeout(() => {
                lyricsContainer.style.transition = "";
            }, 320);
        }
    };

    lyricsContainer.addEventListener("touchend", handleTouchEnd, { passive: true });
    lyricsContainer.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}

