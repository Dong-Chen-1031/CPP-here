import type { APIContext, APIRoute } from "astro";
import * as z from "zod";

export type MakeAPIOptions<T extends z.ZodTypeAny, R extends {}> = {
    body: T;
    handler: (context: APIContext, body: z.infer<T>) => Promise<R>;
};

export function makeAPI<T extends z.ZodTypeAny, R extends {}>({
    body,
    handler,
}: MakeAPIOptions<T, R>): APIRoute {
    return async (context) => {
        let raw: unknown;

        try {
            raw = await context.request.json();
        } catch {
            return Response.json(
                { success: false, error: "Invalid JSON" },
                { status: 400 },
            );
        }

        const parseResult = await body.safeParseAsync(raw);

        if (!parseResult.success) {
            return Response.json(
                {
                    success: false,
                    error: "Invalid request body",
                    details: z.treeifyError(parseResult.error),
                },
                {
                    status: 400,
                },
            );
        }

        const result = await handler(context, parseResult.data);
        if (result instanceof Response) {
            return result;
        }

        return Response.json(result);
    };
}
