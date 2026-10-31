import { redirectToPreferred } from "@/lib/preferredLang";

export const prerender = false;

// "/blog/..." (no language) → "/en/blog/...", "/zh-tw/blog/...", …
export const GET = redirectToPreferred;
