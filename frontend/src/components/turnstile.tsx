import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useRef } from "react";
import axios from "axios";
import config from "@/config/constants";
import { useAtom } from "jotai";
import { alertStore, turnstileRefStore, verifyJwtStore } from "@/store/atom";

export default function TurnstileWidget() {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [jwt, setJwt] = useAtom(verifyJwtStore);
  const [alerts, setAlert] = useAtom(alertStore);
  const [, setTurnstileRefGlobal] = useAtom(turnstileRefStore);
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
              title: "Verification Failed",
              description:
                "Failed to verify Turnstile token. Please try again later.",
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
            title: "Turnstile Unsupported",
            description:
              "Your browser does not support Turnstile. Please use a modern browser.",
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
            title: "Turnstile Error",
            description:
              "An error occurred during Turnstile verification. Please try reloading the page.",
            variant: "destructive",
            id: crypto.randomUUID(),
          },
        ]);
        // turnstileRef.current?.reset();
      }}
    />
  );
}
