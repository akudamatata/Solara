// https://www.w3.org/TR/PNG/#5PNG-file-signature
const pngSignature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
export function writeSignature(buffer) {
    buffer.writeBytes(pngSignature);
}
export function checkSignature(buffer) {
    if (!hasPngSignature(buffer.readBytes(pngSignature.length))) {
        throw new Error('wrong PNG signature');
    }
}
export function hasPngSignature(array) {
    if (array.length < pngSignature.length) {
        return false;
    }
    for (let i = 0; i < pngSignature.length; i++) {
        if (array[i] !== pngSignature[i]) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=signature.js.map