/**
 * Solara 浏览器语音识别封装 (Web Speech API)
 * 单次识别：一次 start 只返回一条结果（含多个候选），优先使用设备端识别
 */

const MAX_ALTERNATIVES = 5;

function getRecognitionCtor() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
    return Boolean(getRecognitionCtor());
}

export function isSecureEnough() {
    return typeof window !== "undefined" && window.isSecureContext === true;
}

// 设备端识别可用性缓存：lang -> true / false
const onDeviceCache = new Map();

function supportsOnDevice(Ctor) {
    return typeof Ctor.available === "function" && "processLocally" in Ctor.prototype;
}

/**
 * 查询设备端识别是否可用（Chrome 139+ 实验特性），结果按语言缓存
 * 仅返回已安装可用的情况，不会主动触发语言包下载
 */
export async function checkOnDevice(lang) {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !supportsOnDevice(Ctor)) return false;
    if (onDeviceCache.has(lang)) return onDeviceCache.get(lang);
    let available = false;
    try {
        const status = await Ctor.available({ langs: [lang], processLocally: true });
        available = status === "available";
    } catch (_) {
        available = false;
    }
    onDeviceCache.set(lang, available);
    return available;
}

// 将浏览器错误码映射为统一的错误类型
function mapError(code) {
    switch (code) {
        case "no-speech":
            return "no-speech";
        case "aborted":
            return "aborted";
        case "not-allowed":
        case "service-not-allowed":
            return "not-allowed";
        case "audio-capture":
            return "no-microphone";
        case "network":
            return "network";
        case "language-not-supported":
            return "language-not-supported";
        default:
            return "unknown";
    }
}

/**
 * 创建一次性识别器
 * onResult(alternatives: string[], { onDevice })
 * onError(type, rawCode)
 * onEnd()
 */
export function createRecognizer({ lang, preferOnDevice = true, onResult, onError, onEnd } = {}) {
    const Ctor = getRecognitionCtor();
    let recognition = null;
    let onDevice = false;

    const start = () => {
        if (!Ctor) {
            if (typeof onError === "function") onError("unsupported", "unsupported");
            return { onDevice: false };
        }

        recognition = new Ctor();
        recognition.lang = lang;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = MAX_ALTERNATIVES;

        // 仅使用已缓存的可用性结果，保证 start 在点击手势内同步执行（Safari 需要）
        onDevice = Boolean(preferOnDevice && onDeviceCache.get(lang) === true && "processLocally" in recognition);
        if (onDevice) {
            recognition.processLocally = true;
        }

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            if (!result) return;
            const alternatives = [];
            for (let i = 0; i < result.length; i += 1) {
                const transcript = result[i] && result[i].transcript;
                if (transcript) alternatives.push(transcript);
            }
            if (typeof onResult === "function") onResult(alternatives, { onDevice });
        };

        recognition.onerror = (event) => {
            const type = mapError(event && event.error);
            // 设备端识别失败时清除缓存，下次退回云端识别
            if (onDevice && (type === "language-not-supported" || type === "unknown")) {
                onDeviceCache.set(lang, false);
            }
            if (typeof onError === "function") onError(type, event && event.error);
        };

        recognition.onend = () => {
            recognition = null;
            if (typeof onEnd === "function") onEnd();
        };

        try {
            recognition.start();
        } catch (error) {
            recognition = null;
            if (typeof onError === "function") onError("unknown", error && error.message);
            if (typeof onEnd === "function") onEnd();
        }
        return { onDevice };
    };

    const stop = () => {
        if (recognition) {
            try { recognition.stop(); } catch (_) {}
        }
    };

    const abort = () => {
        if (recognition) {
            try { recognition.abort(); } catch (_) {}
        }
    };

    return { start, stop, abort };
}
