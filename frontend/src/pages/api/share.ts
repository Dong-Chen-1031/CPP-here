import { makeAPI } from "@/lib/server/api";
import { ShareObjectSchema } from "@/types/share";
import z from "zod";
import { env } from "cloudflare:workers";
import { createHash } from "node:crypto";

import bs58 from "bs58";
export const prerender = false;

async function hashShareObject(
    shareObject: z.infer<typeof ShareObjectSchema>,
): Promise<string> {
    const jsonString = `v2.0.0;${JSON.stringify(shareObject)}`;
    return bs58.encode(createHash("sha256").update(jsonString).digest());
}

const shareAPI = makeAPI({
    url: "/api/share",
    payloadSchema: ShareObjectSchema,
    responseSchema: z.object({
        error: z.string().optional(),
        shareId: z.string().optional(),
    }),

    handler: async ({}, shareObject, reply) => {
        const fullShareId = await hashShareObject(shareObject);

        let len = 5;
        let shareId: string;

        while (true) {
            shareId = fullShareId.slice(0, len);

            const old = await env.R2_BUCKET.head(`share/${shareId}`);

            if (!old) break;
            else if (old.customMetadata?.fullHash === fullShareId) {
                return reply({
                    shareId: shareId,
                });
            } else len += 1;
        }

        await env.R2_BUCKET.put(
            `share/${shareId}`,
            JSON.stringify(shareObject),
            {
                customMetadata: {
                    fullHash: fullShareId,
                },
            },
        );

        return reply({
            shareId: shareId,
        });
    },
});

export const POST = shareAPI.POST;
export type shareAPI = typeof shareAPI;
