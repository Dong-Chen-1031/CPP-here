import * as z from "zod";
import { makeAPI } from "@/lib/server/api";
import { PRIVATE_BUILDER_NODE_ENDPOINT } from "astro:env/server";

export const prerender = false;

const ResponseSchema = z.object({
    js_code: z.string(),
    wasm_url: z.string(),
    errors: z.array(z.string()),
    ok: z.boolean(),
});

export const buildAPI = makeAPI({
    url: "/api/build",
    payloadSchema: z.object({ code: z.string(), cppVersion: z.string() }),
    responseSchema: ResponseSchema,

    handler: async (
        { clientAddress, request },
        { code, cppVersion },
        reply,
    ) => {
        const res = await fetch(`${PRIVATE_BUILDER_NODE_ENDPOINT}/api/build`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Client-IP": clientAddress,
                "X-PostHog-Session-ID":
                    request.headers.get("X-PostHog-Session-ID") || "",
            },
            body: JSON.stringify({ code, cppVersion }),
        });

        if (!res.ok) {
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
