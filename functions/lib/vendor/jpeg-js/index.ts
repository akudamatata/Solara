// Re-export the jpeg-js decoder for use within the worker without relying on npm resolution.
// The decoder implementation is vendored from jpeg-js@0.4.4 (Apache-2.0).
import decode from "./decoder.js";

export { decode };
export default decode;
