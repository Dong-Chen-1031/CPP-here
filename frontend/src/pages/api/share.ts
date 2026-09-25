import { APIError, makeAPI } from "@/lib/server/api";
import { SHARE_KEY_PREFIX, ShareObjectSchema } from "@/types/share";
import z from "zod";
import { env } from "cloudflare:workers";
import { createHash } from "node:crypto";

import bs58 from "bs58";
export const prerender = false;

const SHARE_ID_MIN_LEN = 5;
const SHARE_HASH_METADATA_KEY = "fullhash";

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

        for (let len = SHARE_ID_MIN_LEN; len <= fullShareId.length; len++) {
            const shareId = fullShareId.slice(0, len);
            const key = `${SHARE_KEY_PREFIX}${shareId}`;

            const old = await env.R2_BUCKET.head(key);

            if (!old) {
                await env.R2_BUCKET.put(key, JSON.stringify(shareObject), {
                    customMetadata: {
                        [SHARE_HASH_METADATA_KEY]: fullShareId,
                    },
                });
                return reply({ shareId });
            }

            const storedHash =
                old.customMetadata?.[SHARE_HASH_METADATA_KEY] ??
                old.customMetadata?.fullHash;
            if (storedHash === fullShareId) {
                return reply({ shareId });
            }
        }

        throw new APIError(500, "Could not allocate a share id");
    },
});

export const POST = shareAPI.POST;
export type shareAPI = typeof shareAPI;
