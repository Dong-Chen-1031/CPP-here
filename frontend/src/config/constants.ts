import SETTINGS_JSON_META from "../../../settings.json";

interface SettingsJson {
  api_url?: string;
}

const SETTINGS_JSON: SettingsJson = {
  ...SETTINGS_JSON_META.default,
  ...(SETTINGS_JSON_META[
    import.meta.env.VITE_RUN_MODE as keyof typeof SETTINGS_JSON_META
  ] || SETTINGS_JSON_META["dev"]),
};

// 應用程式配置常數
export const config = {
  // 社群媒體連結
  social: {
    github: "https://github.com/TiHu-Hosting",
  },

  run_mode: import.meta.env.VITE_RUN_MODE || "dev",

  // API 端點
  api_endpoints: SETTINGS_JSON.api_url || "http://127.0.0.1:8000",
} as const;

export default config;
