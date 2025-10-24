import { unfilterAverage, unfilterNone, unfilterPaeth, unfilterSub, unfilterUp, } from "./unfilter.js";
const uint16 = new Uint16Array([0x00ff]);
const uint8 = new Uint8Array(uint16.buffer);
const osIsLittleEndian = uint8[0] === 0xff;
const empty = new Uint8Array(0);
export function decodeInterlaceNull(params) {
    const { data, width, height, channels, depth } = params;
    const bytesPerPixel = Math.ceil(depth / 8) * channels;
    const bytesPerLine = Math.ceil((depth / 8) * channels * width);
    const newData = new Uint8Array(height * bytesPerLine);
    let prevLine = empty;
    let offset = 0;
    let currentLine;
    let newLine;
    for (let i = 0; i < height; i++) {
        currentLine = data.subarray(offset + 1, offset + 1 + bytesPerLine);
        newLine = newData.subarray(i * bytesPerLine, (i + 1) * bytesPerLine);
        switch (data[offset]) {
            case 0:
                unfilterNone(currentLine, newLine, bytesPerLine);
                break;
            case 1:
                unfilterSub(currentLine, newLine, bytesPerLine, bytesPerPixel);
                break;
            case 2:
                unfilterUp(currentLine, newLine, prevLine, bytesPerLine);
                break;
            case 3:
                unfilterAverage(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel);
                break;
            case 4:
                unfilterPaeth(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel);
                break;
            default:
                throw new Error(`Unsupported filter: ${data[offset]}`);
        }
        prevLine = newLine;
        offset += bytesPerLine + 1;
    }
    if (depth === 16) {
        const uint16Data = new Uint16Array(newData.buffer);
        if (osIsLittleEndian) {
            for (let k = 0; k < uint16Data.length; k++) {
                // PNG is always big endian. Swap the bytes.
                uint16Data[k] = swap16(uint16Data[k]);
            }
        }
        return uint16Data;
    }
    else {
        return newData;
    }
}
function swap16(val) {
    return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}
//# sourceMappingURL=decode_interlace_null.js.map