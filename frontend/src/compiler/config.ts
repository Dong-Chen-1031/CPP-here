// Shared with scripts/prepare-toolchain.mjs through toolchain.json. Changing
// the version, flags or header requires regenerating the static toolchain.
import toolchain from "./toolchain.json";

// Defined by the toolchainId Vite plugin (scripts/toolchain-id.mjs): the
// version plus a hash of everything the toolchain is generated from.
declare const __TOOLCHAIN_ID__: string;
export const TOOLCHAIN_ID = __TOOLCHAIN_ID__;
export const STANDARDS = toolchain.standards;
export const COMPILE_FLAGS = toolchain.compileFlags;
export const LINK_FLAGS = toolchain.linkFlags;
export const TOOLCHAIN_ASSETS = toolchain.assets;
export const LOCAL_WORKER_MARKER = "cpp-here:wasi-worker:v1";
