import { Context } from "hono";
import { env } from "hono/adapter";

export type ConfigType = { FRONTEND_URL: string };

export default function config(c: Context) {
    return env<ConfigType>(c);
}
