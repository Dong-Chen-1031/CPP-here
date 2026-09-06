import { makeAPI } from "@/lib/server/api";
import { ShareObjectSchema } from "@/types/share";

export const prerender = false;

export const POST = makeAPI({
    body: ShareObjectSchema,
    handler: async ({ clientAddress }, shareObject) => {
        JSON.stringify(shareObject);
        return Response.json(
            { success: false, error: "Not implemented" },
            { status: 501 },
        );
    },
});
