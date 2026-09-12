import {
    PRIVATE_JWT_EXPIRATION_SECONDS,
    PRIVATE_JWT_SECRET,
} from "astro:env/server";
import { jwtVerify, SignJWT } from "jose";
import { DEV_JWT_SECRET } from "../../../env.defaults.mjs";

if (PRIVATE_JWT_SECRET === DEV_JWT_SECRET) {
    console.warn(
        'You are using the development JWT SECRET, which is insecure. Please set the "PRIVATE_JWT_SECRET" environment variable.Y sou can use "openssl rand -base64 32" to generate it.',
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
