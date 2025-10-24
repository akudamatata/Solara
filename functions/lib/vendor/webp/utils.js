/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Notice: I (Jamie Sinclair) have modified this file to allow manual instantiation of the Wasm Module.
 */
export function initEmscriptenModule(moduleFactory, wasmModule, moduleOptionOverrides = {}) {
    let instantiateWasm;
    if (wasmModule) {
        instantiateWasm = (imports, callback) => {
            const instance = new WebAssembly.Instance(wasmModule, imports);
            callback(instance);
            return instance.exports;
        };
    }
    return moduleFactory({
        // Just to be safe, don't automatically invoke any wasm functions
        noInitialRun: true,
        instantiateWasm,
        ...moduleOptionOverrides,
    });
}
