import config from "@/config/constants";
import { verifyJwtStore } from "@/store/atom";
import axios from "axios";
import { getDefaultStore } from "jotai";
import posthog from "posthog-js";

const defaultStore = getDefaultStore();

const apiAxios = axios.create({
    baseURL: config.api_endpoints,
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
