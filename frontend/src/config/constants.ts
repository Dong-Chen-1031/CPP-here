// 應用程式配置常數
export const config = {
    run_mode: import.meta.env.MODE as "development" | "production",
    turnstileSiteKey:
        import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000BB",

    // API 端點
    api_endpoints: import.meta.env.PUBLIC_API_URL || "http://127.0.0.1:8000",
    skipApiFetch: import.meta.env.SKIP_API_FETCH === "true",
    githubLink: "https://github.com/Dong-Chen-1031/CPP-here",

    editorLink: "/editor",
} as const;

export default config;
