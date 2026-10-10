import { browser } from './browser';
import { DEFAULT_TARGET_URL } from './target';

interface ConfigItems {
  customRules: [string, string][];
  debugMode: boolean;
  targetUrl: string;
}

class Config {
  private readonly defaults: Partial<ConfigItems> = {
    customRules: [],
    debugMode: false,
    targetUrl: DEFAULT_TARGET_URL,
  };

  public async get<T extends keyof ConfigItems>(key: T): Promise<ConfigItems[T]> {
    const data = await browser.storage.local.get(key);
    return (data[key] || this.defaults[key]) as ConfigItems[T];
  }

  public set<T extends keyof ConfigItems>(key: T, value: ConfigItems[T]): Promise<void> {
    return browser.storage.local.set({ [key]: value });
  }
}

export const config = new Config();
