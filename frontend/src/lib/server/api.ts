import type { APIContext, APIRoute } from "astro";
import * as z from "zod";

type APIHandler<T, R extends z.ZodType<object, object>> = (
    context: APIContext,
    body: z.output<T>,
    reply: Reply<R>,
) => Promise<ReplyResult>;

declare const RESULT: unique symbol;

export type APIResponse<R extends z.ZodType<object, object>> = z.output<R> & {
    success: boolean;
    error?: string;
    details?: unknown;
};

type ReplyResult = {
    status?: number;
    success?: boolean;
    body: unknown;
    [RESULT]: true;
};

type Reply<R extends z.ZodType<object, object>> = (
    body: z.input<R>,
    init?: { status?: number; success?: boolean },
) => ReplyResult;

export interface MakeAPIOptions<
    T extends z.ZodType,
    R extends z.ZodType<object, object>,
    URL extends string = string,
> {
    url: URL;
    payloadSchema: T;
    responseSchema: R;
    handler: APIHandler<T, R>;
}

export type ApiSchemas<
    T extends z.ZodType = z.ZodType,
    R extends z.ZodType<object, object> = z.ZodType<object, object>,
> = {
    _bodySchema: T;
    _responseSchema: R;
};

export interface API<
    T extends z.ZodType = z.ZodType,
    R extends z.ZodType<object, object> = z.ZodType<object, object>,
    URL extends string = string,
> {
    url: URL;
    apiSchemas: ApiSchemas<T, R>;
    POST: APIRoute;
}

function fail(status: number, message: string, details?: unknown) {
    return Response.json(
        { success: false, error: message, details },
        { status },
    );
}

export class APIError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = "APIError";
    }
}

export function makeAPI<
    T extends z.ZodType,
    R extends z.ZodType<object, object>,
    URL extends string = string,
>({
    url,
    payloadSchema,
    responseSchema,
    handler,
}: MakeAPIOptions<T, R, URL>): API<T, R, URL> {
    return {
        url,
        apiSchemas: {
            _bodySchema: payloadSchema,
            _responseSchema: responseSchema,
        },
        POST: async (context) => {
            let raw: unknown;

            try {
                raw = await context.request.json();
            } catch {
                return fail(400, "Invalid JSON");
            }

            const parseResult = await payloadSchema.safeParseAsync(raw);

            if (!parseResult.success) {
                return fail(
                    400,
                    "Invalid request body",
                    z.treeifyError(parseResult.error),
                );
            }

            try {
                const reply = ((
                    body: unknown,
                    init?: { status?: number; success?: boolean },
                ) => ({ ...init, body })) as Reply<R>;

                const { status, success, body } = await handler(
                    context,
                    parseResult.data,
                    reply,
                );

                const validated = await responseSchema.safeParseAsync(body);

                if (!validated.success) {
                    console.error(
                        "Response validation failed:",
                        z.treeifyError(validated.error),
                    );
                    return fail(500, "Internal Server Error");
                }

                return Response.json(
                    { success: success ?? true, ...validated.data },
                    {
                        status: status ?? 200,
                    },
                );
            } catch (error) {
                if (error instanceof Response) throw error;
                if (error instanceof APIError) {
                    return fail(error.status, error.message, error.details);
                }
                console.error("API handler error:", error);
                return fail(500, "Internal Server Error");
            }
        },
    };
}
