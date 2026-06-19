import { Hono } from "hono";
import config from "../config/config";
import verify from "./routes/verify";

const app = new Hono();

app.route("/api", verify);

app.get("/", (c) => {
    return c.redirect(config(c).FRONTEND_URL, 301);
});

export default app;
