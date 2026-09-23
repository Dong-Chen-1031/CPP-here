import { turnstileRefStore, verifyJwtStore } from "@/store/atom";
import axios from "axios";
import { getDefaultStore } from "jotai";
import posthog from "posthog-js/dist/module.full.no-external";
import { PUBLIC_API_URL } from "astro:env/client";
import { addAlert } from "@/lib/alert";
import type { APIResponse, API } from "@/lib/server/api";
import type z from "zod";

const defaultStore = getDefaultStore();

const JWT_RENEW_TIMEOUT_MS = 60_000;

const apiAxios = axios.create({
    baseURL: PUBLIC_API_URL,
});

apiAxios.interceptors.request.use((config) => {
    const jwt = defaultStore.get(verifyJwtStore) || "";
    const sessionId = posthog.get_session_id();

    if (jwt) {
        config.headers.Authorization = `Bearer ${jwt}`;
    }
    if (sessionId) {
        config.headers["X-PostHog-Session-ID"] = sessionId;
    }
    return config;
});

let jwtRenewPromise: Promise<string | null> | null = null;

export function renewJwt() {
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
                "Your verification has expired and is being renewed automatically.",
            variant: "destructive",
        });
        const turnstileRef = defaultStore.get(turnstileRefStore);
        turnstileRef?.current?.reset();
    }).finally(() => {
        jwtRenewPromise = null;
    });

    return jwtRenewPromise;
}

// The middleware answers 401 for a missing token and 403 for an invalid one.
export function isAuthError(error: unknown) {
    return (
        axios.isAxiosError(error) &&
        (error.status === 401 || error.status === 403)
    );
}

export async function callAPI<T extends API>(
    url: T["url"],
    data?: z.input<T["apiSchemas"]["_bodySchema"]>,
    allowRetry = true,
): Promise<APIResponse<T["apiSchemas"]["_responseSchema"]>> {
    try {
        const res = await apiAxios.post(url, data);
        return res.data as APIResponse<T["apiSchemas"]["_responseSchema"]>;
    } catch (error) {
        if (!allowRetry || !isAuthError(error)) throw error;

        const jwt = await renewJwt();
        if (!jwt) throw error;

        // Only one retry: the renewed token either works or we give up.
        return await callAPI<T>(url, data, false);
    }
}

export { apiAxios };
export { default as axios } from "axios";
