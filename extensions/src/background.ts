import type { Menus, Runtime, Tabs } from 'webextension-polyfill';
import { getHosts } from './hosts/hosts';
import { Message, MessageAction } from './models/messaging';
import { browser } from './utils/browser';
import { noop } from './utils/noop';
import { sendToContent } from './utils/messaging';
import { request, requiredPermissions } from './utils/request';
import { config } from './utils/config';

declare global {
  const PARSER_NAMES: string[];
}

const DEFAULT_TARGET_URL = 'https://cpp.doong.me/*';
let targetPermissionPattern = DEFAULT_TARGET_URL;

function createContextMenu(): void {
  browser.contextMenus.create({
    id: 'parse-with',
    title: 'Parse with',
    contexts: ['action'],
  });

  browser.contextMenus.create({
    id: 'problem-parser',
    parentId: 'parse-with',
    title: 'Problem parser',
    contexts: ['action'],
  });

  browser.contextMenus.create({
    id: 'contest-parser',
    parentId: 'parse-with',
    title: 'Contest parser',
    contexts: ['action'],
  });

  for (const parser of PARSER_NAMES) {
    const isContestParser = parser.endsWith('ContestParser');

    browser.contextMenus.create({
      id: `parse-with-${parser}`,
      parentId: `${isContestParser ? 'contest' : 'problem'}-parser`,
      title: parser,
      contexts: ['action'],
    });
  }
}

async function loadContentScript(tab: Tabs.Tab, parserName: string): Promise<void> {
  const permissionOrigins: string[] = [];

  if (!tab.url) {
    return;
  }

  for (const prefix in requiredPermissions) {
    if (tab.url.startsWith(prefix)) {
      permissionOrigins.push(requiredPermissions[prefix]);
    }
  }

  await ensurePermissionsOnGesture(permissionOrigins);

  await browser.scripting.executeScript({
    target: {
      tabId: tab.id,
    },
    files: ['js/content.js'],
  });

  sendToContent(tab.id, MessageAction.Parse, { parserName });
}

function onAction(tab: Tabs.Tab): void {
  void loadContentScript(tab, null);
}

function onContextMenu(info: Menus.OnClickData, tab: Tabs.Tab): void {
  if (info.menuItemId.toString().startsWith('parse-with-')) {
    const parserName = info.menuItemId.toString().split('parse-with-').pop();
    void loadContentScript(tab, parserName);
  }
}

// 輔助函式：等待分頁完全載入
function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise(resolve => {
    // browser.tabs.get 直接回傳 Promise
    browser.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        resolve();
      } else {
        // 如果狀態還沒 complete，就掛載監聽器等待
        const listener = (updatedTabId: number, changeInfo: any) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            browser.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        browser.tabs.onUpdated.addListener(listener);
      }
    });
  });
}

async function dispatchExtEvent(tabId: number, payload: unknown): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    args: [payload],
    func: injectedPayload => {
      window.dispatchEvent(new CustomEvent('ext', { detail: injectedPayload }));
    },
  });
}

function normalizeTargetUrl(rawTargetUrl: string): { pattern: string; entry: string } {
  const trimmed = rawTargetUrl.trim();
  const fallback = DEFAULT_TARGET_URL;
  const candidate = trimmed.length > 0 ? trimmed : fallback;

  const entry = candidate.endsWith('/*') ? candidate.slice(0, -1) : candidate;
  const pattern = entry.endsWith('/*') ? entry : `${entry.replace(/\/$/, '')}/*`;

  return { pattern, entry: entry.replace(/\/$/, '') + '/' };
}

async function ensurePermissionsOnGesture(origins: string[]): Promise<void> {
  const combinedOrigins = [...new Set([...origins, targetPermissionPattern])];
  const granted = await browser.permissions.contains({ origins: combinedOrigins });
  if (!granted) {
    throw new Error(`Missing host permissions for ${combinedOrigins.join(', ')}`);
  }
}

async function refreshTargetPermissionPattern(): Promise<void> {
  const configuredTargetUrl = await config.get('targetUrl');
  targetPermissionPattern = normalizeTargetUrl(configuredTargetUrl).pattern;
}

void refreshTargetPermissionPattern().catch(noop);

async function sendTask(tabId: number, messageId: string, data: string): Promise<void> {
  try {
    const parsedData = JSON.parse(data);
    const configuredTargetUrl = await config.get('targetUrl');
    const { pattern: targetUrl, entry: targetEntry } = normalizeTargetUrl(configuredTargetUrl);
    targetPermissionPattern = targetUrl;
    const eventPayload = parsedData.eventPayload ?? parsedData;

    const permissionGranted = await browser.permissions.contains({ origins: [targetUrl] });
    if (!permissionGranted) {
      throw new Error(`No host permission for ${targetUrl}. Click the extension action once to grant it.`);
    }

    let targetTabId: number;

    const tabs = await browser.tabs.query({ url: targetUrl });

    if (tabs.length > 0) {
      targetTabId = tabs[0].id!;

      await browser.tabs.update(targetTabId, { active: true });

      if (tabs[0].windowId) {
        await browser.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      const newTab = await browser.tabs.create({ url: targetEntry, active: true });
      targetTabId = newTab.id!;

      await waitForTabLoad(targetTabId);
    }

    await dispatchExtEvent(targetTabId, eventPayload);

    sendToContent(tabId, MessageAction.SendTaskDone, { messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : `${err}`;
    sendToContent(tabId, MessageAction.SendTaskFailed, { messageId, message });
  }
}

async function makeRequest(
  tabId: number,
  messageId: string,
  url: string,
  options: RequestInit,
  retries: number,
): Promise<void> {
  const permissionGranted = await browser.permissions.contains({ origins: [url] });
  if (!permissionGranted) {
    sendToContent(tabId, MessageAction.FetchFailed, {
      messageId,
      message: `C++ Here does not have permission to request ${url}`,
    });

    return;
  }

  try {
    const content = await request(url, options, retries);
    sendToContent(tabId, MessageAction.FetchResult, { messageId, content });
  } catch (err) {
    const message = err instanceof Error ? err.message : `${err}`;
    sendToContent(tabId, MessageAction.FetchFailed, { messageId, message });
  }
}

async function handleMessage(message: Message | any, sender: Runtime.MessageSender): Promise<void> {
  if (!sender.tab) {
    return;
  }

  if (message.action === MessageAction.SendTask) {
    void sendTask(sender.tab.id, message.payload.messageId, message.payload.message);
  } else if (message.action === MessageAction.Fetch) {
    void makeRequest(
      sender.tab.id,
      message.payload.messageId,
      message.payload.url,
      message.payload.options,
      message.payload.retries,
    );
  }
}

browser.action.onClicked.addListener(onAction);
browser.contextMenus.onClicked.addListener(onContextMenu);
browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onInstalled.addListener(createContextMenu);
