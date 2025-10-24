import { unfilterAverage, unfilterNone, unfilterPaeth, unfilterSub, unfilterUp, } from "./unfilter.js";
/**
 * Apllies filter on scanline based on the filter type.
 * @param filterType - The filter type to apply.
 * @param currentLine - The current line of pixel data.
 * @param newLine - The new line of pixel data.
 * @param prevLine - The previous line of pixel data.
 * @param passLineBytes - The number of bytes in the pass line.
 * @param bytesPerPixel - The number of bytes per pixel.
 */
export function applyUnfilter(filterType, currentLine, newLine, prevLine, passLineBytes, bytesPerPixel) {
    switch (filterType) {
        case 0:
            unfilterNone(currentLine, newLine, passLineBytes);
            break;
        case 1:
            unfilterSub(currentLine, newLine, passLineBytes, bytesPerPixel);
            break;
        case 2:
            unfilterUp(currentLine, newLine, prevLine, passLineBytes);
            break;
        case 3:
            unfilterAverage(currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
            break;
        case 4:
            unfilterPaeth(currentLine, newLine, prevLine, passLineBytes, bytesPerPixel);
            break;
        default:
            throw new Error(`Unsupported filter: ${filterType}`);
    }
}
//# sourceMappingURL=apply_unfilter.js.map