/**
 * Solara 唤醒词引擎接口 (WakeEngine)
 * 阶段一：无引擎，使用麦克风按钮触发；阶段二在此文件接入具体的设备端唤醒词引擎
 *
 * WakeEngine: { supported, start(), stop(), onWake(callback) }
 */

export function createWakeEngine() {
    return {
        supported: false,
        start() {},
        stop() {},
        onWake() {},
    };
}
