import "../lib/i18n";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { turnstileRefStore, verifyJwtStore } from "@/store/atom";
import {
    PUBLIC_TURNSTILE_SITE_KEY,
    PUBLIC_BYPASS_CAPTCHA,
} from "astro:env/client";
import { addAlert } from "@/lib/alert";
import { callAPI } from "@/lib/axiosInstance";
import type { verifyAPI } from "@/pages/api/verify";

/** How long before the JWT expires we refresh the Turnstile token. */
const RESET_BUFFER_MS = 10000;

export default function TurnstileWidget() {
    if (PUBLIC_BYPASS_CAPTCHA) {
        const [, setJwt] = useAtom(verifyJwtStore);
        setJwt("bypass-captcha");
        return null;
    }
    const turnstileRef = useRef<TurnstileInstance | null>(null);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [, setJwt] = useAtom(verifyJwtStore);
    const [, setTurnstileRefGlobal] = useAtom(turnstileRefStore);
    const { t } = useTranslation(["editor"]);
    useEffect(() => {
        setTurnstileRefGlobal(turnstileRef);
        return () => {
            if (resetTimerRef.current !== null) {
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = null;
            }
        };
    }, []);

    return (
        <Turnstile
            siteKey={PUBLIC_TURNSTILE_SITE_KEY}
            ref={turnstileRef}
            options={{ retryInterval: 1000 }}
            onSuccess={async (token) => {
                try {
                    const {
                        success,
                        token: newJwt,
                        error,
                        expires_in,
                    } = await callAPI<verifyAPI>("/api/verify", {
                        token,
                    });

                    if (!success || !newJwt) {
                        console.error("Verification rejected:", error);
                        addAlert({
                            title: t("turnstile.verificationFailed"),
                            description: t("turnstile.verificationFailedDesc"),
                            variant: "destructive",
                        });
                        return;
                    }

                    setJwt(newJwt);

                    const resetDelay =
                        typeof expires_in === "number" &&
                        Number.isFinite(expires_in)
                            ? expires_in * 1000 - RESET_BUFFER_MS
                            : NaN;
                    if (!(resetDelay > 0)) {
                        console.warn(
                            "Skipping Turnstile auto-reset: unusable expires_in",
                            expires_in,
                        );
                        return;
                    }

                    if (resetTimerRef.current !== null) {
                        clearTimeout(resetTimerRef.current);
                    }
                    resetTimerRef.current = setTimeout(() => {
                        resetTimerRef.current = null;
                        // setJwt(null);
                        turnstileRef.current?.reset();
                    }, resetDelay);
                } catch (err) {
                    console.error("Verification error:", err);
                    addAlert({
                        title: t("turnstile.verificationFailed"),
                        description: t("turnstile.verificationFailedDesc"),
                        variant: "destructive",
                    });
                    // turnstileRef.current?.reset();
                }
            }}
            onUnsupported={() => {
                addAlert({
                    title: t("turnstile.unsupported"),
                    description: t("turnstile.unsupportedDesc"),
                    variant: "destructive",
                });
            }}
            onTimeout={() => {
                console.log("Turnstile timed out.");
            }}
            onError={(err) => {
                console.error("Turnstile error:", err);
                addAlert({
                    title: t("turnstile.error"),
                    description: t("turnstile.errorDesc"),
                    variant: "destructive",
                });
                // turnstileRef.current?.reset();
            }}
        />
    );
}
