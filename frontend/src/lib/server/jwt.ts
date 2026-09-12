import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_JWT_SECRET,
} from "astro:env/server";
import { jwtVerify, SignJWT } from "jose";
import { DEV_JWT_SECRET } from "../../../env.defaults.mjs";

if (PRIVATE_JWT_SECRET === DEV_JWT_SECRET) {
    if (import.meta.env.PROD) {
        throw new Error(
            'PRIVATE_JWT_SECRET is unset — refusing to start in production with the public dev secret. You can use "openssl rand -base64 32" to generate it.',
        );
    }
    console.warn(
        "Using the development JWT secret; do not use this in production.",
    );
}

const secret = new TextEncoder().encode(PRIVATE_JWT_SECRET);
const algorithm = "HS256";

export function createJWT(payload: Record<string, any>) {
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
