import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef } from "react";
import axios from "axios";
import config from "@/config/constants";
import { useAtom } from "jotai";
import { verifyJwtStore } from "@/store/atom";

export default function TurnstileWidget() {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [jwt, setJwt] = useAtom(verifyJwtStore);
  return (
    <Turnstile
      siteKey={config.turnstileSiteKey}
      ref={turnstileRef}
      options={{ retryInterval: 1000 }}
      onSuccess={async (token) => {
        const res = await axios.post(`${config.api_endpoints}/verify`, {
          token: token,
        });
        setJwt(res.data.token);
        setTimeout(
          () => {
            turnstileRef.current?.reset();
          },
          res.data.expires_in * 1000 - 10000,
        );
      }}
      onUnsupported={() => {
        alert("Your browser does not support Turnstile.");
      }}
      onTimeout={() => {
        console.log("Turnstile timed out.");
      }}
      onError={(err) => {
        console.error("Turnstile error:", err);
        // turnstileRef.current?.reset();
      }}
    />
  );
}
