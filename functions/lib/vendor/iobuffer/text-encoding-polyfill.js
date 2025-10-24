"use strict";
/*
 * Copyright 2017 Sam Thorogood. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
(function (scope) {
    'use strict';
    // fail early
    if (scope['TextEncoder'] && scope['TextDecoder']) {
        return false;
    }
    /**
     * @constructor
     * @param {string=} utfLabel
     */
    function FastTextEncoder(utfLabel = 'utf-8') {
        if (utfLabel !== 'utf-8') {
            throw new RangeError(`Failed to construct 'TextEncoder': The encoding label provided ('${utfLabel}') is invalid.`);
        }
    }
    Object.defineProperty(FastTextEncoder.prototype, 'encoding', {
        value: 'utf-8',
    });
    /**
     * @param {string} string
     * @param {{stream: boolean}=} options
     * @return {!Uint8Array}
     */
    FastTextEncoder.prototype.encode = function (string, options = { stream: false }) {
        if (options.stream) {
            throw new Error(`Failed to encode: the 'stream' option is unsupported.`);
        }
        let pos = 0;
        const len = string.length;
        const out = [];
        let at = 0; // output position
        let tlen = Math.max(32, len + (len >> 1) + 7); // 1.5x size
        let target = new Uint8Array((tlen >> 3) << 3); // ... but at 8 byte offset
        while (pos < len) {
            let value = string.charCodeAt(pos++);
            if (value >= 0xd800 && value <= 0xdbff) {
                // high surrogate
                if (pos < len) {
                    const extra = string.charCodeAt(pos);
                    if ((extra & 0xfc00) === 0xdc00) {
                        ++pos;
                        value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
                    }
                }
                if (value >= 0xd800 && value <= 0xdbff) {
                    continue; // drop lone surrogate
                }
            }
            // expand the buffer if we couldn't write 4 bytes
            if (at + 4 > target.length) {
                tlen += 8; // minimum extra
                tlen *= 1.0 + (pos / string.length) * 2; // take 2x the remaining
                tlen = (tlen >> 3) << 3; // 8 byte offset
                const update = new Uint8Array(tlen);
                update.set(target);
                target = update;
            }
            if ((value & 0xffffff80) === 0) {
                // 1-byte
                target[at++] = value; // ASCII
                continue;
            }
            else if ((value & 0xfffff800) === 0) {
                // 2-byte
                target[at++] = ((value >> 6) & 0x1f) | 0xc0;
            }
            else if ((value & 0xffff0000) === 0) {
                // 3-byte
                target[at++] = ((value >> 12) & 0x0f) | 0xe0;
                target[at++] = ((value >> 6) & 0x3f) | 0x80;
            }
            else if ((value & 0xffe00000) === 0) {
                // 4-byte
                target[at++] = ((value >> 18) & 0x07) | 0xf0;
                target[at++] = ((value >> 12) & 0x3f) | 0x80;
                target[at++] = ((value >> 6) & 0x3f) | 0x80;
            }
            else {
                // FIXME: do we care
                continue;
            }
            target[at++] = (value & 0x3f) | 0x80;
        }
        return target.slice(0, at);
    };
    /**
     * @constructor
     * @param {string=} utfLabel
     * @param {{fatal: boolean}=} options
     */
    function FastTextDecoder(utfLabel = 'utf-8', options = { fatal: false }) {
        if (utfLabel !== 'utf-8') {
            throw new RangeError(`Failed to construct 'TextDecoder': The encoding label provided ('${utfLabel}') is invalid.`);
        }
        if (options.fatal) {
            throw new Error(`Failed to construct 'TextDecoder': the 'fatal' option is unsupported.`);
        }
    }
    Object.defineProperty(FastTextDecoder.prototype, 'encoding', {
        value: 'utf-8',
    });
    Object.defineProperty(FastTextDecoder.prototype, 'fatal', { value: false });
    Object.defineProperty(FastTextDecoder.prototype, 'ignoreBOM', {
        value: false,
    });
    /**
     * @param {(!ArrayBuffer|!ArrayBufferView)} buffer
     * @param {{stream: boolean}=} options
     */
    FastTextDecoder.prototype.decode = function (buffer, options = { stream: false }) {
        if (options['stream']) {
            throw new Error(`Failed to decode: the 'stream' option is unsupported.`);
        }
        const bytes = new Uint8Array(buffer);
        let pos = 0;
        const len = bytes.length;
        const out = [];
        while (pos < len) {
            const byte1 = bytes[pos++];
            if (byte1 === 0) {
                break; // NULL
            }
            if ((byte1 & 0x80) === 0) {
                // 1-byte
                out.push(byte1);
            }
            else if ((byte1 & 0xe0) === 0xc0) {
                // 2-byte
                const byte2 = bytes[pos++] & 0x3f;
                out.push(((byte1 & 0x1f) << 6) | byte2);
            }
            else if ((byte1 & 0xf0) === 0xe0) {
                const byte2 = bytes[pos++] & 0x3f;
                const byte3 = bytes[pos++] & 0x3f;
                out.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3);
            }
            else if ((byte1 & 0xf8) === 0xf0) {
                const byte2 = bytes[pos++] & 0x3f;
                const byte3 = bytes[pos++] & 0x3f;
                const byte4 = bytes[pos++] & 0x3f;
                // this can be > 0xffff, so possibly generate surrogates
                let codepoint = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
                if (codepoint > 0xffff) {
                    // codepoint &= ~0x10000;
                    codepoint -= 0x10000;
                    out.push(((codepoint >>> 10) & 0x3ff) | 0xd800);
                    codepoint = 0xdc00 | (codepoint & 0x3ff);
                }
                out.push(codepoint);
            }
            else {
                // FIXME: we're ignoring this
            }
        }
        return String.fromCharCode.apply(null, out);
    };
    scope['TextEncoder'] = FastTextEncoder;
    scope['TextDecoder'] = FastTextDecoder;
})(typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
        ? self
        : this);
//# sourceMappingURL=text-encoding-polyfill.js.map