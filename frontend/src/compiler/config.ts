// Shared with scripts/prepare-toolchain.mjs through toolchain.json. Changing
// the version, flags or header requires regenerating the static toolchain.
import toolchain from "./toolchain.json";

export const TOOLCHAIN_VERSION = toolchain.version;
export const STANDARDS = toolchain.standards;
export const COMPILE_FLAGS = toolchain.compileFlags;
export const LINK_FLAGS = toolchain.linkFlags;
export const TOOLCHAIN_ASSETS = toolchain.assets;
export const LOCAL_WORKER_MARKER = "cpp-here:wasi-worker:v1";
