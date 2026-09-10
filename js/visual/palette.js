/**
 * Solara 图像调色板提取引擎 (Canvas 像素级颜色采样与色彩空间转换算法)
 */

import {
    PALETTE_MAX_DIMENSION,
    PALETTE_TARGET_SAMPLE_COUNT,
    PALETTE_STORAGE_KEY
} from "../constants.js";
import {
    safeGetLocalStorage,
    safeSetLocalStorage
} from "../core/storage.js";

export const paletteCache = new Map();

export function paletteClamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function paletteComponentToHex(value) {
    const clamped = paletteClamp(Math.round(value), 0, 255);
    return clamped.toString(16).padStart(2, "0");
}

export function paletteRgbToHex({ r, g, b }) {
    return `#${paletteComponentToHex(r)}${paletteComponentToHex(g)}${paletteComponentToHex(b)}`;
}

export function paletteRgbToHsl(r, g, b) {
    const rNorm = paletteClamp(r / 255, 0, 1);
    const gNorm = paletteClamp(g / 255, 0, 1);
    const bNorm = paletteClamp(b / 255, 0, 1);

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rNorm) {
            h = ((gNorm - bNorm) / delta) % 6;
        } else if (max === gNorm) {
            h = (bNorm - rNorm) / delta + 2;
        } else {
            h = (rNorm - gNorm) / delta + 4;
        }
        h *= 60;
        if (h < 0) {
            h += 360;
        }
    }

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return { h, s, l };
}

export function paletteHueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

export function paletteHslToRgb(h, s, l) {
    const saturation = paletteClamp(s, 0, 1);
    const lightness = paletteClamp(l, 0, 1);

    const normalizedHue = ((h % 360) + 360) % 360 / 360;

    if (saturation === 0) {
        const value = lightness * 255;
        return { r: value, g: value, b: value };
    }

    const q = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;

    const r = paletteHueToRgb(p, q, normalizedHue + 1 / 3) * 255;
    const g = paletteHueToRgb(p, q, normalizedHue) * 255;
    const b = paletteHueToRgb(p, q, normalizedHue - 1 / 3) * 255;

    return { r, g, b };
}

export function paletteHslToHex(color) {
    const rgb = paletteHslToRgb(color.h, color.s, color.l);
    return paletteRgbToHex(rgb);
}

export function paletteRelativeLuminance(r, g, b) {
    const normalize = (value) => {
        const channel = paletteClamp(value / 255, 0, 1);
        return channel <= 0.03928
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
    };

    const rLin = normalize(r);
    const gLin = normalize(g);
    const bLin = normalize(b);

    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function palettePickContrastColor(color) {
    const luminance = paletteRelativeLuminance(color.r, color.g, color.b);
    return luminance > 0.45 ? "#1f2937" : "#f8fafc";
}

export function paletteAdjustSaturation(base, factor, offset = 0) {
    return paletteClamp(base * factor + offset, 0, 1);
}

export function paletteAdjustLightness(base, offset, factor = 1) {
    return paletteClamp(base * factor + offset, 0, 1);
}

export function analyzeImageDataColors(imageData) {
    const { data } = imageData;
    const totalPixels = data.length / 4;
    const step = Math.max(1, Math.floor(totalPixels / PALETTE_TARGET_SAMPLE_COUNT));

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let validCount = 0;

    let desaturatedCount = 0;
    const NUM_BINS = 24;
    const binWeights = new Float32Array(NUM_BINS);
    const binR = new Float64Array(NUM_BINS);
    const binG = new Float64Array(NUM_BINS);
    const binB = new Float64Array(NUM_BINS);
    const binCount = new Uint32Array(NUM_BINS);

    for (let index = 0; index < data.length; index += step * 4) {
        const alpha = data[index + 3];
        if (alpha < 48) {
            continue;
        }

        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];

        totalR += r;
        totalG += g;
        totalB += b;
        validCount++;

        const hsl = paletteRgbToHsl(r, g, b);

        // 统计黑白/低饱和像素（如素描、胶片黑白摄影）
        if (hsl.s < 0.15) {
            desaturatedCount++;
        }

        // 过滤极端暗部与过曝高光，避免无彩极值干扰主色相判断
        if (hsl.l < 0.07 || hsl.l > 0.94) {
            continue;
        }

        // 过滤极低饱和噪点，确保分箱提取的是封面真正的彩色基调
        if (hsl.s < 0.12) {
            continue;
        }

        const binIndex = Math.min(NUM_BINS - 1, Math.max(0, Math.floor((hsl.h % 360) / (360 / NUM_BINS))));
        // 权重公式：兼顾色彩面积与中心明度平衡，杜绝单点边缘反光喧宾夺主
        const lightnessBalance = 1 - Math.abs(hsl.l - 0.5) * 1.4;
        const weight = Math.max(0.1, lightnessBalance) * (hsl.s * 0.6 + 0.4);

        binWeights[binIndex] += weight;
        binR[binIndex] += r * weight;
        binG[binIndex] += g * weight;
        binB[binIndex] += b * weight;
        binCount[binIndex]++;
    }

    if (validCount === 0) {
        throw new Error("No opaque pixels available for analysis");
    }

    const avgR = totalR / validCount;
    const avgG = totalG / validCount;
    const avgB = totalB / validCount;
    const average = paletteRgbToHsl(avgR, avgG, avgB);

    // 1. 黑白封面判定：超过 72% 的像素为无彩色或低饱和度时，判定为单色/黑白艺术封面
    const desatRatio = desaturatedCount / validCount;
    if (desatRatio >= 0.72) {
        return {
            isMonochrome: true,
            average,
            accent: { h: 215, s: 0.04, l: 0.46 },
        };
    }

    // 2. 寻找权重最高的主导色相分箱
    let bestBin = -1;
    let maxWeight = 0;
    for (let b = 0; b < NUM_BINS; b++) {
        if (binWeights[b] > maxWeight) {
            maxWeight = binWeights[b];
            bestBin = b;
        }
    }

    // 若有效彩色像素过少，回退至加权平均色
    if (bestBin === -1 || maxWeight <= 0) {
        return {
            isMonochrome: desatRatio >= 0.5,
            average,
            accent: average,
        };
    }

    const dominantR = binR[bestBin] / maxWeight;
    const dominantG = binG[bestBin] / maxWeight;
    const dominantB = binB[bestBin] / maxWeight;
    const dominantHsl = paletteRgbToHsl(dominantR, dominantG, dominantB);

    return {
        isMonochrome: false,
        average,
        accent: dominantHsl,
    };
}

export function buildPaletteFromAccent(accent, average, isMonochrome = false) {
    let lightColors;
    let darkColors;

    if (isMonochrome) {
        // 黑白/单色封面：纯净高级的冷石墨浅灰银白，彻底杜绝泛黄与大白墙刺眼感
        lightColors = ["#dde1e7", "#d3d8df", "#c6cdd6"];
        darkColors  = ["#181a20", "#121418", "#0d0f12"];
    } else {
        const isRedFamily = (accent.h >= 335 || accent.h <= 24);

        if (isRedFamily) {
            // 红色/暗红/洋红防变粉机制：
            // 色彩学规律：红色在明度 L > 0.70 时物理表现即为“粉红 (Pink)”。
            // 调和策略：明度牢牢锁定在柔和护眼的 0.65~0.71，色相微调向暖陶土（H: 15~22），呈现 Apple 标志性的温润陶土暖红，杜绝荧光芭比粉！
            const warmH = (accent.h + 14) % 360;
            const redS = paletteClamp(accent.s * 0.28 + 0.06, 0.16, 0.28);
            lightColors = [
                paletteHslToHex({ h: warmH, s: redS, l: 0.70 }),
                paletteHslToHex({ h: (warmH + 10) % 360, s: Math.max(0.12, redS - 0.03), l: 0.73 }),
                paletteHslToHex({ h: warmH, s: Math.max(0.10, redS - 0.05), l: 0.76 }),
            ];
        } else {
            // 常规彩色封面（如海蓝、青绿、深琥珀）：适度降低浅色模式明度（0.72~0.79），消除发白过曝死光
            const lightS = paletteClamp(accent.s * 0.26 + 0.06, 0.14, 0.30);
            lightColors = [
                paletteHslToHex({ h: accent.h, s: lightS, l: paletteClamp(accent.l * 0.10 + 0.72, 0.72, 0.79) }),
                paletteHslToHex({ h: (accent.h + 16) % 360, s: Math.max(0.11, lightS - 0.03), l: paletteClamp(accent.l * 0.08 + 0.75, 0.74, 0.81) }),
                paletteHslToHex({ h: accent.h, s: Math.max(0.09, lightS - 0.05), l: paletteClamp(accent.l * 0.06 + 0.77, 0.76, 0.83) }),
            ];
        }

        // 暗色模式：午夜深邃光晕，严格抑制饱和度 (0.16~0.30)，彻底消除夜间刺眼荧光
        const darkS = paletteClamp(accent.s * 0.34, 0.14, 0.28);
        darkColors = [
            paletteHslToHex({ h: accent.h, s: darkS, l: paletteClamp(accent.l * 0.08 + 0.15, 0.13, 0.22) }),
            paletteHslToHex({ h: (accent.h + 12) % 360, s: Math.max(0.10, darkS - 0.04), l: paletteClamp(accent.l * 0.06 + 0.12, 0.10, 0.18) }),
            paletteHslToHex({ h: accent.h, s: Math.max(0.08, darkS - 0.06), l: paletteClamp(accent.l * 0.05 + 0.09, 0.08, 0.14) }),
        ];
    }

    const accentRgb = paletteHslToRgb(accent.h, accent.s, accent.l);

    return {
        source: "client",
        baseColor: paletteHslToHex(accent),
        averageColor: paletteHslToHex(average),
        accentColor: paletteHslToHex(accent),
        contrastColor: palettePickContrastColor(accentRgb),
        gradients: {
            light: {
                colors: lightColors,
                gradient: `linear-gradient(140deg, ${lightColors[0]} 0%, ${lightColors[1]} 45%, ${lightColors[2]} 100%)`,
            },
            dark: {
                colors: darkColors,
                gradient: `linear-gradient(135deg, ${darkColors[0]} 0%, ${darkColors[1]} 55%, ${darkColors[2]} 100%)`,
            },
        },
        tokens: {
            light: {
                primaryColor: paletteHslToHex({ h: accent.h, s: paletteClamp(accent.s * 0.40 + 0.08, 0.18, 0.45), l: paletteClamp(accent.l * 0.16 + 0.34, 0.30, 0.42) }),
                primaryColorDark: paletteHslToHex({ h: accent.h, s: paletteClamp(accent.s * 0.45 + 0.05, 0.20, 0.50), l: paletteClamp(accent.l * 0.12 + 0.24, 0.22, 0.34) }),
            },
            dark: {
                primaryColor: paletteHslToHex({ h: accent.h, s: paletteClamp(accent.s * 0.36 + 0.06, 0.18, 0.38), l: paletteClamp(accent.l * 0.12 + 0.36, 0.32, 0.44) }),
                primaryColorDark: paletteHslToHex({ h: accent.h, s: paletteClamp(accent.s * 0.40 + 0.04, 0.20, 0.42), l: paletteClamp(accent.l * 0.08 + 0.26, 0.22, 0.32) }),
            },
        },
    };
}

export async function extractPaletteFromCanvas(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                const maxSide = Math.max(img.width, img.height);
                const scale = PALETTE_MAX_DIMENSION / maxSide;
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                
                const imageData = ctx.getImageData(0, 0, w, h);
                const analyzed = analyzeImageDataColors(imageData);
                const palette = buildPaletteFromAccent(analyzed.accent, analyzed.average, analyzed.isMonochrome);
                palette.source = imageUrl;
                
                resolve(palette);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error("Failed to load image for canvas analysis"));
        img.src = imageUrl;
    });
}

export function loadStoredPalettes() {
    const stored = safeGetLocalStorage(PALETTE_STORAGE_KEY);
    if (!stored) {
        return;
    }

    try {
        const entries = JSON.parse(stored);
        if (Array.isArray(entries)) {
            for (const entry of entries) {
                if (Array.isArray(entry) && typeof entry[0] === "string" && entry[1] && typeof entry[1] === "object") {
                    paletteCache.set(entry[0], entry[1]);
                }
            }
        }
    } catch (error) {
        console.warn("解析调色板缓存失败", error);
    }
}

export function persistPaletteCache() {
    const maxEntries = 20;
    const entries = Array.from(paletteCache.entries()).slice(-maxEntries);
    try {
        safeSetLocalStorage(PALETTE_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
        console.warn("保存调色板缓存失败", error);
    }
}

// 初始化加载调色板本地缓存
loadStoredPalettes();

export async function fetchPaletteData(imageUrl, signal) {
    if (paletteCache.has(imageUrl)) {
        const cached = paletteCache.get(imageUrl);
        paletteCache.delete(imageUrl);
        paletteCache.set(imageUrl, cached);
        return cached;
    }

    const response = await fetch(`/palette?image=${encodeURIComponent(imageUrl)}`, { signal });
    const raw = await response.text();
    let payload = null;
    try {
        payload = raw ? JSON.parse(raw) : null;
    } catch (parseError) {
        console.warn("解析调色板响应失败:", parseError);
    }

    if (!response.ok) {
        const detail = payload && payload.error ? ` (${payload.error})` : "";
        throw new Error(`Palette request failed: ${response.status}${detail}`);
    }

    if (payload === null) {
        throw new Error("Palette response missing body");
    }

    const data = payload;
    if (paletteCache.has(imageUrl)) {
        paletteCache.delete(imageUrl);
    }
    paletteCache.set(imageUrl, data);
    persistPaletteCache();
    return data;
}
