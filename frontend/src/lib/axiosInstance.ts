import { verifyJwtStore } from "@/store/atom";
import axios from "axios";
import { getDefaultStore } from "jotai";
import posthog from "posthog-js";
import { PUBLIC_API_URL } from "astro:env/client";

const defaultStore = getDefaultStore();

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

export { apiAxios as apiAxios };
export { default as axios } from "axios";
