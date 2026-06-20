import type { APIContext } from "astro";
import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_JWT_SECRET,
    PRIVATE_TURNSTILE_SECRET_KEY,
} from "astro:env/server";
import { jwtVerify, SignJWT } from "jose";

const secret = new TextEncoder().encode(PRIVATE_JWT_SECRET);
const algorithm = "HS256";

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
function createJWT(payload: Record<string, any>) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: algorithm })
        .setIssuedAt()
        .setExpirationTime(`${PRIVATE_JWT_EXPIRATION_SECONDS}s`)
        .sign(secret);
}

export async function verifyJWT(token: string) {
    try {
        const { payload } = await jwtVerify(token, secret, {
            algorithms: [algorithm],
        });
        return payload.verified === true;
    } catch (e) {
        console.error("JWT verification failed:", e);
        return false;
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
