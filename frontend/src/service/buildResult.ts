import type { BuildResult } from "./build";

/** A build that produced nothing; by default the compiler could not be used. */
export const failedBuild = (text: string, unavailable = true): BuildResult => ({
    ok: false,
    js_code: "",
    wasm_url: "",
    errors: [text],
    unavailable,
});
