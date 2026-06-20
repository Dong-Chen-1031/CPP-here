import { PUBLIC_BYPASS_CAPTCHA } from "astro:env/client";
import { PRIVATE_TEST_JWT } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";
import crypto from "node:crypto";
import { verifyJWT } from "@/pages/api/verify";

export const onRequest = defineMiddleware(async (context, next) => {
    // console.log("Middleware triggered for:", context);
    if (
        !context.url.pathname.startsWith("/api") ||
        context.url.pathname.startsWith("/api/verify")
    )
        return next();
    if (PUBLIC_BYPASS_CAPTCHA) {
        console.warn(
            "Bypassing CAPTCHA verification due to PUBLIC_BYPASS_CAPTCHA being true",
        );
        return next();
    }
    const token = context.request.headers
        .get("Authorization")
        ?.replace("Bearer ", "");
    if (!token) {
        console.warn("No JWT token provided in Authorization header");
        return new Response("Unauthorized", { status: 401 });
    }
    if (PRIVATE_TEST_JWT) {
        const a = Buffer.from(token);
        const b = Buffer.from(PRIVATE_TEST_JWT);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            console.warn("Using test JWT token, bypassing verification");
            return next();
        }
    }
    const isValid = await verifyJWT(token);
    if (!isValid) {
        console.warn("JWT verification failed");
        return new Response("Forbidden", { status: 403 });
    }
    return next();
});

// export const onRequest = defineMiddleware(async (context, next) => {
//     return next();
// });
