/**
 * Converts indexed data into RGB/RGBA format
 * @param decodedImage - Image to decode data from.
 * @returns Uint8Array with RGB data.
 */
export function convertIndexedToRgb(decodedImage) {
    const palette = decodedImage.palette;
    const depth = decodedImage.depth;
    if (!palette) {
        throw new Error('Color palette is undefined.');
    }
    checkDataSize(decodedImage);
    const indexSize = decodedImage.width * decodedImage.height;
    const resSize = indexSize * palette[0].length;
    const res = new Uint8Array(resSize);
    let indexPos = 0;
    let offset = 0;
    const indexes = new Uint8Array(indexSize);
    let bit = 0xff;
    switch (depth) {
        case 1:
            bit = 0x80;
            break;
        case 2:
            bit = 0xc0;
            break;
        case 4:
            bit = 0xf0;
            break;
        case 8:
            bit = 0xff;
            break;
        default:
            throw new Error('Incorrect depth value');
    }
    for (const byte of decodedImage.data) {
        let bit2 = bit;
        let shift = 8;
        while (bit2) {
            shift -= depth;
            indexes[indexPos++] = (byte & bit2) >> shift;
            bit2 = bit2 >> depth;
            if (indexPos % decodedImage.width === 0) {
                break;
            }
        }
    }
    if (decodedImage.palette) {
        for (const index of indexes) {
            const color = decodedImage.palette.at(index);
            if (!color) {
                throw new Error('Incorrect index of palette color');
            }
            res.set(color, offset);
            offset += color.length;
        }
    }
    return res;
}
function checkDataSize(image) {
    const expectedSize = image.depth < 8
        ? Math.ceil((image.width * image.depth) / 8) *
            image.height *
            image.channels
        : image.width * image.height * image.channels;
    if (image.data.length !== expectedSize) {
        throw new RangeError(`wrong data size. Found ${image.data.length}, expected ${expectedSize}`);
    }
}
//# sourceMappingURL=convert_indexed_to_rgb.js.map