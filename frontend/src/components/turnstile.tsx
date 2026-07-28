import "../lib/i18n";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { useAtom } from "jotai";
import { alertStore, turnstileRefStore, verifyJwtStore } from "@/store/atom";
import { PUBLIC_API_URL, PUBLIC_TURNSTILE_SITE_KEY } from "astro:env/client";
import { addAlert } from "@/lib/alert";
import { apiAxios } from "@/lib/axiosInstance";

export default function TurnstileWidget() {
    const turnstileRef = useRef<TurnstileInstance | null>(null);
    const [jwt, setJwt] = useAtom(verifyJwtStore);
    const [, setTurnstileRefGlobal] = useAtom(turnstileRefStore);
    const { t } = useTranslation(["editor"]);
    useEffect(() => {
        setTurnstileRefGlobal(turnstileRef);
    }, []);

    return (
        <Turnstile
            siteKey={PUBLIC_TURNSTILE_SITE_KEY}
            ref={turnstileRef}
            options={{ retryInterval: 1000 }}
            onSuccess={async (token) => {
                try {
                    const res = await apiAxios.post(`/verify`, {
                        token: token,
                    });
                    setJwt(res.data.token);
                    setTimeout(
                        () => {
                            // setJwt(null);
                            turnstileRef.current?.reset();
                        },
                        res.data.expires_in * 1000 - 10000,
                    );
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
