import {
    turnstileRefStore,
    verifyFailedStore,
    verifyJwtStore,
} from "@/store/atom";
import axios from "axios";
import i18next from "i18next";
import { getDefaultStore } from "jotai";
import { PUBLIC_API_URL } from "astro:env/client";
import { addAlert } from "@/lib/alert";
import type { APIResponse, API } from "@/lib/server/api";
import type z from "zod";

const defaultStore = getDefaultStore();

const JWT_RENEW_TIMEOUT_MS = 60_000;
// Turnstile usually verifies in a few seconds after the page loads.
const JWT_WAIT_TIMEOUT_MS = 30_000;

const apiAxios = axios.create({
    baseURL: PUBLIC_API_URL,
});

apiAxios.interceptors.request.use((config) => {
    const jwt = defaultStore.get(verifyJwtStore) || "";

    if (jwt) {
        config.headers.Authorization = `Bearer ${jwt}`;
    }
    return config;
});

/**
 * The verified token, waiting for Turnstile if it is still verifying.
 * Resolves to false when verification takes too long or has failed.
 */
export function waitForJwt(): Promise<string | false> {
    const jwt = defaultStore.get(verifyJwtStore);
    if (jwt) return Promise.resolve(jwt);
    if (defaultStore.get(verifyFailedStore)) return Promise.resolve(false);
    return new Promise((resolve) => {
        const finish = (result: string | false) => {
            clearTimeout(timer);
            unsubJwt();
            unsubFailed();
            resolve(result);
        };
        const timer = setTimeout(() => finish(false), JWT_WAIT_TIMEOUT_MS);
        const unsubJwt = defaultStore.sub(verifyJwtStore, () => {
            const jwt = defaultStore.get(verifyJwtStore);
            if (jwt) finish(jwt);
        });
        const unsubFailed = defaultStore.sub(verifyFailedStore, () => {
            if (defaultStore.get(verifyFailedStore)) finish(false);
        });
    });
}

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
            title: i18next.t("editor:auth.unauthorizedTitle"),
            description: i18next.t("editor:auth.unauthorizedDescription"),
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
