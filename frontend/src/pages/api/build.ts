import * as z from "zod";
import { makeAPI } from "@/lib/server/api";
import {
    PRIVATE_BUILDER_NODE_ENDPOINT,
    PRIVATE_BUILDER_NODE_KEY,
} from "astro:env/server";
import { env } from "cloudflare:workers";

export const prerender = false;

const ResponseSchema = z.object({
    js_code: z.string(),
    wasm_url: z.string(),
    errors: z.array(z.string()),
    ok: z.boolean(),
});

const FORWARD_HEADERS = [
    "X-PostHog-Distinct-ID",
    "X-PostHog-Session-ID",
    "X-PostHog-Window-ID",
];

export const buildAPI = makeAPI({
    url: "/api/build",
    payloadSchema: z.object({ code: z.string(), cppVersion: z.string() }),
    responseSchema: ResponseSchema,

    handler: async (
        { clientAddress, request },
        { code, cppVersion },
        reply,
    ) => {
        const forwarded = Object.fromEntries(
            FORWARD_HEADERS.flatMap((name) => {
                const value = request.headers.get(name);
                return value ? [[name, value]] : [];
            }),
        );

        const res = await fetch(`${PRIVATE_BUILDER_NODE_ENDPOINT}/api/build`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // The middleware already checked the user's token. The builder
                // node checks its own Authorization header, so authenticate as
                // the frontend with a shared key (its CAPTCHA_TEST_TOKEN)
                // instead of forwarding a token it cannot verify.
                Authorization: `Bearer ${PRIVATE_BUILDER_NODE_KEY}`,
                "X-Client-IP": clientAddress,
                ...forwarded,
            },
            body: JSON.stringify({ code, cppVersion }),
        });

        if (!res.ok) {
            env.ANALYTICS.writeDataPoint({
                blobs: [
                    "build",
                    cppVersion,
                    "error",
                    res.status.toString(),
                    res.statusText,
                ],
                doubles: [1],
                indexes: [crypto.randomUUID()],
            });
            return reply(
                {
                    js_code: "",
                    wasm_url: "",
                    errors: [
                        `Builder node returned an error: ${res.status} ${res.statusText}`,
                    ],
                    ok: false,
                },
                { success: false },
            );
        }

        const parsed = ResponseSchema.safeParse(await res.json());
        if (!parsed.success) {
            return reply(
                {
                    js_code: "",
                    wasm_url: "",
                    errors: ["Invalid response from builder node."],
                    ok: false,
                },
                { success: false },
            );
        }
        const data = parsed.data;

        return reply({
            js_code: data.js_code,
            wasm_url: data.wasm_url,
            errors: data.errors || [],
            ok: data.ok,
        });
    },
});

export type buildAPI = typeof buildAPI;
export const POST = buildAPI.POST;
