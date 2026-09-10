import { makeAPI } from "@/lib/server/api";
import { ShareObjectSchema } from "@/types/share";
import z from "zod";
import { env } from "cloudflare:workers";

export const prerender = false;

async function generateSHA256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);

    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex;
}

async function hashShareObject(
    shareObject: z.infer<typeof ShareObjectSchema>,
): Promise<string> {
    const jsonString = `v2.0.0;${shareObject.code};${shareObject.inputData};${shareObject.outputData};${shareObject.testCase}`;
    return await generateSHA256(jsonString);
}

const shareAPI = makeAPI({
    url: "/api/share",
    payloadSchema: ShareObjectSchema,
    responseSchema: z.object({
        error: z.string().optional(),
        share_id: z.string().optional(),
    }),

    handler: async ({}, shareObject, reply) => {
        JSON.stringify(shareObject);

        const shareId = await hashShareObject(shareObject);

        env.R2_BUCKET.put(`share/${shareId}`, JSON.stringify(shareObject));

        return reply({
            share_id: shareId,
        });
    },
});

export const POST = shareAPI.POST;
export type shareAPI = typeof shareAPI;
