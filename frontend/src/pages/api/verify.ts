import type { APIContext } from "astro";
import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_TURNSTILE_SECRET_KEY,
} from "astro:env/server";
import { createJWT } from "@/lib/server/jwt";

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
                    remoteip: remoteip,
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
export const prerender = false;

export async function POST({ request }: APIContext) {
    const { token, remoteip } = (await request.json()) as {
        token: string;
        remoteip: string;
    };
    const turnstileResult = await validateTurnstile(token, remoteip);

    if (!turnstileResult.success) {
        return new Response(
            JSON.stringify({
                success: false,
            }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const jwt = createJWT({ verified: true });
    return new Response(
        JSON.stringify({
            success: true,
            token: jwt,
            expires_in: PRIVATE_JWT_EXPIRATION_SECONDS,
        }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        },
    );
}
