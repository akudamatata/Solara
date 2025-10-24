export function unfilterNone(currentLine, newLine, bytesPerLine) {
    for (let i = 0; i < bytesPerLine; i++) {
        newLine[i] = currentLine[i];
    }
}
export function unfilterSub(currentLine, newLine, bytesPerLine, bytesPerPixel) {
    let i = 0;
    for (; i < bytesPerPixel; i++) {
        // just copy first bytes
        newLine[i] = currentLine[i];
    }
    for (; i < bytesPerLine; i++) {
        newLine[i] = (currentLine[i] + newLine[i - bytesPerPixel]) & 0xff;
    }
}
export function unfilterUp(currentLine, newLine, prevLine, bytesPerLine) {
    let i = 0;
    if (prevLine.length === 0) {
        // just copy bytes for first line
        for (; i < bytesPerLine; i++) {
            newLine[i] = currentLine[i];
        }
    }
    else {
        for (; i < bytesPerLine; i++) {
            newLine[i] = (currentLine[i] + prevLine[i]) & 0xff;
        }
    }
}
export function unfilterAverage(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel) {
    let i = 0;
    if (prevLine.length === 0) {
        for (; i < bytesPerPixel; i++) {
            newLine[i] = currentLine[i];
        }
        for (; i < bytesPerLine; i++) {
            newLine[i] = (currentLine[i] + (newLine[i - bytesPerPixel] >> 1)) & 0xff;
        }
    }
    else {
        for (; i < bytesPerPixel; i++) {
            newLine[i] = (currentLine[i] + (prevLine[i] >> 1)) & 0xff;
        }
        for (; i < bytesPerLine; i++) {
            newLine[i] =
                (currentLine[i] + ((newLine[i - bytesPerPixel] + prevLine[i]) >> 1)) &
                    0xff;
        }
    }
}
export function unfilterPaeth(currentLine, newLine, prevLine, bytesPerLine, bytesPerPixel) {
    let i = 0;
    if (prevLine.length === 0) {
        for (; i < bytesPerPixel; i++) {
            newLine[i] = currentLine[i];
        }
        for (; i < bytesPerLine; i++) {
            newLine[i] = (currentLine[i] + newLine[i - bytesPerPixel]) & 0xff;
        }
    }
    else {
        for (; i < bytesPerPixel; i++) {
            newLine[i] = (currentLine[i] + prevLine[i]) & 0xff;
        }
        for (; i < bytesPerLine; i++) {
            newLine[i] =
                (currentLine[i] +
                    paethPredictor(newLine[i - bytesPerPixel], prevLine[i], prevLine[i - bytesPerPixel])) &
                    0xff;
        }
    }
}
function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc)
        return a;
    else if (pb <= pc)
        return b;
    else
        return c;
}
//# sourceMappingURL=unfilter.js.map