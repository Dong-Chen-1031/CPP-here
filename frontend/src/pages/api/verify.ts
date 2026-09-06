import * as z from "zod";
import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_TURNSTILE_SECRET_KEY,
    PRIVATE_TURNSTILE_CHECK_IP,
} from "astro:env/server";
import { createJWT } from "@/lib/server/jwt";
import { makeAPI } from "@/lib/server/api";

export const prerender = false;

async function validateTurnstile(token: string, remoteip: string) {
    try {
        const response = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    secret: PRIVATE_TURNSTILE_SECRET_KEY,
                    response: token,
                    remoteip: PRIVATE_TURNSTILE_CHECK_IP ? remoteip : undefined,
                }),
            },
        );

        const result = (await response.json()) as { success: boolean };
        return result;
    } catch (error) {
        console.error("Turnstile validation error:", error);
        return { success: false, "error-codes": ["internal-error"] };
    }
}

export const POST = makeAPI({
    body: z.object({ token: z.string() }),
    handler: async ({ clientAddress }, { token }) => {
        const turnstileResult = await validateTurnstile(token, clientAddress);

        if (!turnstileResult.success) {
            return Response.json({ success: false }, { status: 400 });
        }

        const jwt = await createJWT({ verified: true });
        return Response.json(
            {
                success: true,
                token: jwt,
                expires_in: PRIVATE_JWT_EXPIRATION_SECONDS,
            },
            { status: 200 },
        );
    },
});
