import { applyUnfilter } from "./apply_unfilter.js";
const uint16 = new Uint16Array([0x00ff]);
const uint8 = new Uint8Array(uint16.buffer);
const osIsLittleEndian = uint8[0] === 0xff;
/**
 * Decodes the Adam7 interlaced PNG data.
 * @param params - DecodeInterlaceNullParams
 * @returns - array of pixel data.
 */
export function decodeInterlaceAdam7(params) {
    const { data, width, height, channels, depth } = params;
    // Adam7 interlacing pattern
    const passes = [
        { x: 0, y: 0, xStep: 8, yStep: 8 }, // Pass 1
        { x: 4, y: 0, xStep: 8, yStep: 8 }, // Pass 2
        { x: 0, y: 4, xStep: 4, yStep: 8 }, // Pass 3
        { x: 2, y: 0, xStep: 4, yStep: 4 }, // Pass 4
        { x: 0, y: 2, xStep: 2, yStep: 4 }, // Pass 5
        { x: 1, y: 0, xStep: 2, yStep: 2 }, // Pass 6
        { x: 0, y: 1, xStep: 1, yStep: 2 }, // Pass 7
    ];
    const bytesPerPixel = Math.ceil(depth / 8) * channels;
    const resultData = new Uint8Array(height * width * bytesPerPixel);
    let offset = 0;
    // Process each pass
    for (let passIndex = 0; passIndex < 7; passIndex++) {
        const pass = passes[passIndex];
        // Calculate pass dimensions
        const passWidth = Math.ceil((width - pass.x) / pass.xStep);
        const passHeight = Math.ceil((height - pass.y) / pass.yStep);
        if (passWidth <= 0 || passHeight <= 0)
            continue;
        const passLineBytes = passWidth * bytesPerPixel;
        const prevLine = new Uint8Array(passLineBytes);
        // Process each scanline in this pass
        for (let y = 0; y < passHeight; y++) {
            // First byte is the filter type
            const filterType = data[offset++];
            const currentLine = data.subarray(offset, offset + passLineBytes);
            offset += passLineBytes;
            // Create a new line for the unfiltered data
            const newLine = new Uint8Array(passLineBytes);
            // Apply the appropriate unfilter
            applyUnfilter(filterType, currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
            prevLine.set(newLine);
            for (let x = 0; x < passWidth; x++) {
                const outputX = pass.x + x * pass.xStep;
                const outputY = pass.y + y * pass.yStep;
                if (outputX >= width || outputY >= height)
                    continue;
                for (let i = 0; i < bytesPerPixel; i++) {
                    resultData[(outputY * width + outputX) * bytesPerPixel + i] =
                        newLine[x * bytesPerPixel + i];
                }
            }
        }
    }
    if (depth === 16) {
        const uint16Data = new Uint16Array(resultData.buffer);
        if (osIsLittleEndian) {
            for (let k = 0; k < uint16Data.length; k++) {
                // PNG is always big endian. Swap the bytes.
                uint16Data[k] = swap16(uint16Data[k]);
            }
        }
        return uint16Data;
    }
    else {
        return resultData;
    }
}
function swap16(val) {
    return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}
//# sourceMappingURL=decode_interlace_adam7.js.map