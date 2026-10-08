import i18next from "i18next";
import { callAPI, isAuthError } from "@/lib/axiosInstance";
import type { buildAPI } from "@/pages/api/build";
import type { BuildResult } from "./build";
import { createBuildCache } from "./buildCache";

// Its wasm_url stays valid: the builder node keeps a build for days after
// its last use.
const cache = createBuildCache();

export async function serverBuild(
    code: string,
    cppVersion: string,
): Promise<BuildResult> {
    const hit = cache.get(code, cppVersion);
    if (hit) return hit;
    try {
        const response = await callAPI<buildAPI>("/api/build", {
            code,
            cppVersion,
        });
        // success is false when the builder node failed, not the code
        const result = { ...response, unavailable: !response.success };
        if (response.success) cache.set(code, cppVersion, result);
        return result;
    } catch (error) {
        console.error("Error during build request:", error);
        return {
            ok: false,
            js_code: "",
            wasm_url: "",
            errors: [
                isAuthError(error)
                    ? i18next.t("editor:run.verificationFailed")
                    : String(error),
            ],
            unavailable: true,
        };
    }
}
