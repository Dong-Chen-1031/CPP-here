import SETTINGS_JSON_META from "../../../settings.json";

interface SettingsJson {
  api_url?: string;
}

const SETTINGS_JSON: SettingsJson = {
  ...SETTINGS_JSON_META.default,
  ...(SETTINGS_JSON_META[
    import.meta.env.PUBLIC_RUN_MODE as keyof typeof SETTINGS_JSON_META
  ] || SETTINGS_JSON_META["dev"]),
};

// 應用程式配置常數
export const config = {
  run_mode: import.meta.env.PUBLIC_RUN_MODE || "dev",

  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || "",

  // API 端點
  api_endpoints: SETTINGS_JSON.api_url || "http://127.0.0.1:8000",
} as const;

export default config;
