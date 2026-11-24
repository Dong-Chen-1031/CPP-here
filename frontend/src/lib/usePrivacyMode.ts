import { useSyncExternalStore } from "react";
import { privacyMode } from "./privacy";

const subscribe = () => () => {};

/**
 * privacyMode for components rendered on the server too: false while
 * hydrating, like the prerendered HTML, then the real value.
 */
export function usePrivacyMode() {
    return useSyncExternalStore(
        subscribe,
        () => privacyMode,
        () => false,
    );
}
