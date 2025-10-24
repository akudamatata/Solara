import webpModuleFactory from "./codec/dec/webp_dec.js";
import { initEmscriptenModule } from "./utils.js";
import wasmBase64 from "./codec/dec/webp_dec.wasm.base64.js";

let modulePromise;

function decodeBase64ToUint8Array(base64) {
  const binaryString = typeof atob === "function"
    ? atob(base64)
    : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

async function getDecoderModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const wasmBytes = decodeBase64ToUint8Array(wasmBase64);
      const wasmModule = await WebAssembly.compile(wasmBytes);
      return initEmscriptenModule(webpModuleFactory, wasmModule);
    })();
  }
  return modulePromise;
}

export async function decodeWebP(input) {
  const module = await getDecoderModule();
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = module.decode(buffer);
  if (!result) {
    throw new Error("WebP decoding failed");
  }
  const { width, height, data } = result;
  const pixels = new Uint8ClampedArray(data.length);
  pixels.set(data);
  return { width, height, data: pixels };
}
