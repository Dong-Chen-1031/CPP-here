import i18next from "i18next";
import { callAPI, isAuthError } from "@/lib/axiosInstance";
import type { buildAPI } from "@/pages/api/build";
import type { BuildResult } from "./build";

export async function serverBuild(
    code: string,
    cppVersion: string,
): Promise<BuildResult> {
    try {
        const response = await callAPI<buildAPI>("/api/build", {
            code,
            cppVersion,
        });
        // success is false when the builder node failed, not the code
        return { ...response, unavailable: !response.success };
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
