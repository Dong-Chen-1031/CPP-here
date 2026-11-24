export const PRIVACY_MODE_KEY = "privacyMode";

function readPrivacyMode() {
    try {
        return (
            typeof localStorage !== "undefined" &&
            localStorage.getItem(PRIVACY_MODE_KEY) === "true"
        );
    } catch {
        // Storage blocked (some private windows): the setting cannot be on.
        return false;
    }
}

export const privacyMode = readPrivacyMode();

export function setPrivacyMode(on: boolean) {
    try {
        if (on) localStorage.setItem(PRIVACY_MODE_KEY, "true");
        else localStorage.removeItem(PRIVACY_MODE_KEY);
    } catch (error) {
        console.warn("Could not save the privacy mode setting:", error);
        return false;
    }
    location.reload();
    return true;
}
