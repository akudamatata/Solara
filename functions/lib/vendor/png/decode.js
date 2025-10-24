import PngDecoder from "./png_decoder.js";

export function decodePng(data, options) {
  const decoder = new PngDecoder(data, options);
  return decoder.decode();
}
