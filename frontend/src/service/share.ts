import {
    codeStore,
    inputStore,
    outputStore,
    testCasesStore,
    turnstileRefStore,
    verifyJwtStore,
} from "@/store/atom";
import { PUBLIC_S3_BUCKET_NAME, PUBLIC_S3_BUCKET_URL } from "astro:env/client";
import { axios, callAPI } from "@/lib/axiosInstance";
import { addAlert } from "@/lib/alert";
import { getDefaultStore } from "jotai";
import { ShareObjectSchema, type ShareObject } from "@/types/share";
import type { shareAPI } from "@/pages/api/share";

const defaultStore = getDefaultStore();

const JWT_RENEW_TIMEOUT_MS = 60_000;

let jwtRenewPromise: Promise<string | null> | null = null;

function renewJwt() {
    if (jwtRenewPromise) return jwtRenewPromise;

    jwtRenewPromise = new Promise<string | null>((resolve) => {
        let settled = false;
        const finish = (jwt: string | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsub();
            resolve(jwt);
        };

        const timer = setTimeout(() => finish(null), JWT_RENEW_TIMEOUT_MS);
        const unsub = defaultStore.sub(verifyJwtStore, () => {
            const jwt = defaultStore.get(verifyJwtStore);
            if (jwt) finish(jwt);
        });

        defaultStore.set(verifyJwtStore, null);
        addAlert({
            title: "Unauthorized",
            description:
                "Your verification has expired and will be automatically renewed. Please try running your code again.",
            variant: "destructive",
        });
        const turnstileRef = defaultStore.get(turnstileRefStore);
        turnstileRef?.current?.reset();
    }).finally(() => {
        jwtRenewPromise = null;
    });

    return jwtRenewPromise;
}

type ShareResult =
    | { ok: true; shareId: string }
    | { ok: false; errors: string[] };

export async function shareCode(allowRetry = true): Promise<ShareResult> {
    try {
        const code = defaultStore.get(codeStore);
        const testCase = defaultStore.get(testCasesStore);
        const inputData = defaultStore.get(inputStore);
        const outputData = defaultStore.get(outputStore);

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
        if (axios.isAxiosError(error) && error.status === 401) {
            if (!allowRetry) {
                return {
                    ok: false,
                    errors: ["Verification failed. Please try again."],
                };
            }

            const jwt = await renewJwt();
            if (!jwt) {
                return {
                    ok: false,
                    errors: ["Verification could not be renewed in time."],
                };
            }

            // Only one retry: the renewed token either works or we give up.
            return await shareCode(false);
        }
        return { ok: false, errors: [String(error)] };
    }
}

type FetchShareResult =
    | { ok: true; data: ShareObject }
    | { ok: false; errors: string[] };

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
        const respond = await axios.get(
            `${PUBLIC_S3_BUCKET_URL}/${PUBLIC_S3_BUCKET_NAME}/${encodeURIComponent(shareId)}`,
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
