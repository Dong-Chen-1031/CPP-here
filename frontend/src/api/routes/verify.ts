import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createMiddleware } from "hono/factory";

// ==========================================
// 1. 環境變數設定 (依照你的運行環境調整)
// ==========================================
// 注意：如果在 Cloudflare Workers 執行，建議改用 c.env 取得環境變數
const env = {
    JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
    JWT_EXPIRY_SECONDS: parseInt(process.env.JWT_EXPIRY_SECONDS || "3600", 10),
    TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || "your-turnstile-secret",
    BYPASS_CAPTCHA: process.env.BYPASS_CAPTCHA === "true",
    CAPTCHA_TEST_TOKEN: process.env.CAPTCHA_TEST_TOKEN || "",
};

// ==========================================
// 2. Schema 定義 (對應 Pydantic BaseModel)
// ==========================================
const VerifyRequestSchema = z.object({
    token: z.string(),
});

// ==========================================
// 3. Turnstile 驗證函式
// ==========================================
async function validateTurnstile(token: string, secret: string) {
    const formData = new URLSearchParams();
    formData.append("secret", secret);
    formData.append("response", token);

    const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
            method: "POST",
            body: formData,
        },
    );

    const data = (await res.json()) as { success: boolean; [key: string]: any };
    if (!data.success) {
        throw new Error("Turnstile validation returned false");
    }
    return data;
}

// ==========================================
// 4. Token 驗證 Middleware (對應 need_token)
// ==========================================
export const needToken = createMiddleware(async (c, next) => {
    if (env.BYPASS_CAPTCHA) {
        console.warn(
            "Bypassing CAPTCHA verification due to BYPASS_CAPTCHA setting",
        );
        return await next();
    }

    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
        return c.json({ detail: "Authorization token missing" }, 401);
    }

    // 對應 hmac.compare_digest，這裡使用簡單的字串比對
    if (env.CAPTCHA_TEST_TOKEN && token === env.CAPTCHA_TEST_TOKEN) {
        console.warn("Using CAPTCHA test token, bypassing verification");
        return await next();
    }

    try {
        const decoded = await verify(token, env.JWT_SECRET);
        if (!decoded.verified) {
            return c.json({ detail: "Invalid or expired token" }, 403);
        }
    } catch (e: any) {
        // 區分過期與無效 Token 的錯誤
        if (e.name === "JwtTokenExpired") {
            return c.json({ detail: "Token has expired" }, 400);
        }
        return c.json({ detail: "Invalid token" }, 400);
    }

    return await next();
});

// ==========================================
// 5. 路由實作
// ==========================================
const router = new Hono();

router.post("/verify", zValidator("json", VerifyRequestSchema), async (c) => {
    // zValidator 確保了 request body 符合 Schema
    const { token } = c.req.valid("json");

    try {
        // 1. 驗證 Turnstile
        await validateTurnstile(token, env.TURNSTILE_SECRET);

        // 2. 建立 JWT
        const exp = Math.floor(Date.now() / 1000) + env.JWT_EXPIRY_SECONDS;
        const payload = {
            verified: true,
            exp: exp,
        };

        const jwtToken = await sign(payload, env.JWT_SECRET);

        // 3. 回傳 VerifyRespond 格式
        return c.json({
            token: jwtToken,
            expires_in: env.JWT_EXPIRY_SECONDS,
            success: true,
        });
    } catch (e) {
        console.warn(`Turnstile verification failed: ${e}`);
        return c.json({ detail: "Turnstile verification failed" }, 400);
    }
});

// 測試用：需要 Token 才能存取的 API
router.get("/protected-route", needToken, (c) => {
    return c.json({
        message: "You have successfully bypassed or verified the token!",
    });
});

export default router;
