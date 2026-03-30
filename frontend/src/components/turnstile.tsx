import "../lib/i18n";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import config from "@/config/constants";
import { useAtom } from "jotai";
import { alertStore, turnstileRefStore, verifyJwtStore } from "@/store/atom";

export default function TurnstileWidget() {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [jwt, setJwt] = useAtom(verifyJwtStore);
  const [alerts, setAlert] = useAtom(alertStore);
  const [, setTurnstileRefGlobal] = useAtom(turnstileRefStore);
  const { t } = useTranslation(["editor"]);
  useEffect(() => {
    setTurnstileRefGlobal(turnstileRef);
  }, []);

  return (
    <Turnstile
      siteKey={config.turnstileSiteKey}
      ref={turnstileRef}
      options={{ retryInterval: 1000 }}
      onSuccess={async (token) => {
        try {
          const res = await axios.post(`${config.api_endpoints}/verify`, {
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
          setAlert((p) => [
            ...p,
            {
              title: t("turnstile.verificationFailed"),
              description: t("turnstile.verificationFailedDesc"),
              variant: "destructive",
              id: crypto.randomUUID(),
            },
          ]);
          console.log(alerts);
          // turnstileRef.current?.reset();
        }
      }}
      onUnsupported={() => {
        setAlert((p) => [
          ...p,
          {
            title: t("turnstile.unsupported"),
            description: t("turnstile.unsupportedDesc"),
            variant: "destructive",
            id: crypto.randomUUID(),
          },
        ]);
      }}
      onTimeout={() => {
        console.log("Turnstile timed out.");
      }}
      onError={(err) => {
        console.error("Turnstile error:", err);
        setAlert((p) => [
          ...p,
          {
            title: t("turnstile.error"),
            description: t("turnstile.errorDesc"),
            variant: "destructive",
            id: crypto.randomUUID(),
          },
        ]);
        // turnstileRef.current?.reset();
      }}
    />
  );
}
