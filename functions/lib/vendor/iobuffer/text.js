// eslint-disable-next-line import/no-unassigned-import
import './text-encoding-polyfill.js';
export function decode(bytes, encoding = 'utf8') {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(bytes);
}
const encoder = new TextEncoder();
export function encode(str) {
    return encoder.encode(str);
}
//# sourceMappingURL=text.browser.js.map