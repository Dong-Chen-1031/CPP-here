import { codeStore, inputStore, testCasesStore } from "@/store/atom";
import { PUBLIC_S3_BUCKET_NAME, PUBLIC_S3_BUCKET_URL } from "astro:env/client";
import { axios, callAPI, isAuthError } from "@/lib/axiosInstance";
import { getDefaultStore } from "jotai";
import { exportOutputCases, outputStore } from "@/store/outputStore";
import { SHARE_OUTPUT_LIMIT_CHARS } from "@/config/runLimits";
import {
    SHARE_KEY_PREFIX,
    ShareObjectSchema,
    type ShareObject,
} from "@/types/share";
import type { shareAPI } from "@/pages/api/share";

const defaultStore = getDefaultStore();

type ShareResult =
    { ok: true; shareId: string } | { ok: false; errors: string[] };

export async function shareCode(): Promise<ShareResult> {
    try {
        const code = defaultStore.get(codeStore);
        const testCase = defaultStore.get(testCasesStore);
        const inputData = defaultStore.get(inputStore);
        const outputData = await exportOutputCases(
            defaultStore.get(outputStore),
            SHARE_OUTPUT_LIMIT_CHARS,
        );

        const { shareId, success } = await callAPI<shareAPI>(`/api/share`, {
            code,
            testCase,
            inputData,
            outputData,
        });
        if (!success || !shareId) {
            return {
                ok: false,
                errors: ["Failed to share code. Please try again."],
            };
        }
        return { ok: true, shareId: shareId };
    } catch (error) {
        console.error("Error during share request:", error);
        if (isAuthError(error)) {
            return {
                ok: false,
                errors: ["Verification failed. Please try again."],
            };
        }
        return { ok: false, errors: [String(error)] };
    }
}

type FetchShareResult =
    { ok: true; data: ShareObject } | { ok: false; errors: string[] };

export async function fetchSharedCode(
    shareId: string,
): Promise<FetchShareResult> {
    if (!PUBLIC_S3_BUCKET_URL) {
        console.error(
            "S3 bucket URL is not configured. Cannot fetch shared code.",
        );
        return { ok: false, errors: ["S3 bucket URL is not configured."] };
    }
    try {
        // PUBLIC_S3_BUCKET_NAME is empty when the bucket is already part of
        // the URL (e.g. an R2 custom domain), set for path-style S3 URLs.
        const baseUrl = [
            PUBLIC_S3_BUCKET_URL.replace(/\/+$/, ""),
            PUBLIC_S3_BUCKET_NAME,
        ]
            .filter(Boolean)
            .join("/");
        const respond = await axios.get(
            `${baseUrl}/${SHARE_KEY_PREFIX}${encodeURIComponent(shareId)}`,
        );

        const parsed = ShareObjectSchema.safeParse(respond.data);
        if (!parsed.success) {
            console.error("Malformed share payload:", parsed.error.issues);
            return { ok: false, errors: ["Malformed share payload."] };
        }

        return { ok: true, data: parsed.data };
    } catch (error) {
        console.error("Error during fetch shared code request:", error);
        return { ok: false, errors: [String(error)] };
    }
}
