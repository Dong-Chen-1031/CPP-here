import i18next from "i18next";
import { callAPI, isAuthError } from "@/lib/axiosInstance";
import type { buildAPI } from "@/pages/api/build";
import type { BuildResult } from "./build";
import { createBuildCache } from "./buildCache";
import { failedBuild } from "./buildResult";

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
        // Anything but a build result (a misconfigured PUBLIC_API_URL serving
        // HTML, a proxy page) means the server cannot be used.
        if (typeof response?.ok !== "boolean")
            return failedBuild(
                i18next.t("editor:compiler.serverInvalidResponse"),
            );
        // The builder failed, not the code: success is false from the
        // Cloudflare API, unavailable is set by the Python backend (Docker,
        // static builds), which leaves success out.
        const unavailable =
            response.success === false ||
            (response as { unavailable?: unknown }).unavailable === true;
        const result: BuildResult = {
            ok: response.ok,
            js_code: response.js_code ?? "",
            wasm_url: response.wasm_url ?? "",
            errors: response.errors ?? [],
            unavailable,
        };
        if (!unavailable) cache.set(code, cppVersion, result);
        return result;
    } catch (error) {
        console.error("Error during build request:", error);
        return failedBuild(
            isAuthError(error)
                ? i18next.t("editor:run.verificationFailed")
                : String(error),
        );
    }
}
