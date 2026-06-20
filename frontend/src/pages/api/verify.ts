import type { APIContext } from "astro";
import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_JWT_SECRET,
} from "astro:env/server";
import { jwtVerify, SignJWT } from "jose";

const secret = new TextEncoder().encode(PRIVATE_JWT_SECRET);
const algorithm = "HS256";

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

export function GET({ params, request }: APIContext) {}
