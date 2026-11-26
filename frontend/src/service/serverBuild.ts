import i18next from "i18next";
import { callAPI, isAuthError } from "@/lib/apiClient";
import type { buildAPI } from "@/pages/api/build";
import type { BuildResult } from "./build";
import { createBuildCache } from "./buildCache";
import { failedBuild } from "./buildResult";

// Holds the compiled WebAssembly.Module, so running the same code again needs
// neither a request nor a compile.
const cache = createBuildCache();

/** Decodes base64, with the native decoder where the browser has one. */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const native = (
        Uint8Array as unknown as {
            fromBase64?: (s: string) => Uint8Array<ArrayBuffer>;
        }
    ).fromBase64;
    if (native) return native(base64);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

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
            response.success === false || response.unavailable === true;
        const result: BuildResult = {
            ok: response.ok,
            js_code: response.js_code ?? "",
            errors: response.errors ?? [],
            warnings: response.warnings,
            unavailable,
        };
        if (result.ok) {
            try {
                result.wasmModule = await WebAssembly.compile(
                    base64ToBytes(response.wasm_base64),
                );
            } catch (error) {
                console.error("Invalid wasm from the server:", error);
                return failedBuild(
                    i18next.t("editor:compiler.serverInvalidResponse"),
                );
            }
        }
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
