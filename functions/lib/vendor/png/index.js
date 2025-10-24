import PngDecoder from "./png_decoder.js";
import PngEncoder from "./png_encoder.js";
export { hasPngSignature } from "./helpers/signature.js";
export * from "./types.js";
function decodePng(data, options) {
    const decoder = new PngDecoder(data, options);
    return decoder.decode();
}
function encodePng(png, options) {
    const encoder = new PngEncoder(png, options);
    return encoder.encode();
}
function decodeApng(data, options) {
    const decoder = new PngDecoder(data, options);
    return decoder.decodeApng();
}
export { decodeApng, decodePng as decode, encodePng as encode };
export { convertIndexedToRgb } from "./convert_indexed_to_rgb.js";
//# sourceMappingURL=index.js.map