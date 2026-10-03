import type { Menus, Runtime, Tabs } from 'webextension-polyfill';
import { Message, MessageAction } from './models/messaging';
import { browser } from './utils/browser';
import { config } from './utils/config';
import { sendToContent } from './utils/messaging';
import { noop } from './utils/noop';
import { request, requiredPermissions } from './utils/request';

declare global {
  const PARSER_NAMES: string[];
}

const DEFAULT_TARGET_URL = 'https://cpp.doong.me/editor/*';
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

const TAB_LOAD_TIMEOUT_MS = 30_000;
const LISTENER_READY_TIMEOUT_MS = 30_000;

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    };

    const onUpdated = (updatedTabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType): void => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    };

    const onRemoved = (removedTabId: number): void => {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error('The C++ Here tab was closed before it finished loading.'));
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`The C++ Here tab did not finish loading within ${TAB_LOAD_TIMEOUT_MS / 1000} seconds.`));
    }, TAB_LOAD_TIMEOUT_MS);

    // Listen before checking the current status so a load that completes in between is not missed
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);

    browser.tabs.get(tabId).then(
      tab => {
        if (tab.status === 'complete') {
          cleanup();
          resolve();
        }
      },
      err => {
        cleanup();
        reject(err);
      },
    );
  });
}

type DispatchResult = 'delivered' | 'rejected' | 'timeout';

async function dispatchExtEvent(tabId: number, payload: unknown): Promise<void> {
  // The injected function returns a promise, which executeScript waits for before resolving
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    args: [payload, LISTENER_READY_TIMEOUT_MS],
    world: 'MAIN',
    func: (injectedPayload: unknown, timeoutMs: number): Promise<DispatchResult> => {
      const dispatch = (): DispatchResult => {
        const event = new CustomEvent('ext', { detail: injectedPayload, cancelable: true });
        // The editor calls preventDefault() once it has accepted the payload,
        // which makes dispatchEvent() return false
        return window.dispatchEvent(event) ? 'rejected' : 'delivered';
      };

      return new Promise(resolve => {
        if ((window as any).eventListenerLoaded) {
          resolve(dispatch());
          return;
        }

        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if ((window as any).eventListenerLoaded) {
            clearInterval(checkInterval);
            resolve(dispatch());
          } else if (Date.now() - startTime > timeoutMs) {
            clearInterval(checkInterval);
            resolve('timeout');
          }
        }, 50);
      });
    },
  });

  const result = injection?.result as DispatchResult | undefined;

  if (result === 'delivered') {
    return;
  }

  if (result === 'rejected') {
    throw new Error('The C++ Here editor did not accept the problem data. Try reloading the editor tab.');
  }

  if (result === 'timeout') {
    throw new Error(
      `The C++ Here editor was not ready within ${LISTENER_READY_TIMEOUT_MS / 1000} seconds. Make sure the editor tab has finished loading and try again.`,
    );
  }

  throw new Error('Could not send the problem data to the C++ Here editor tab.');
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
  const granted = await browser.permissions.request({ origins: combinedOrigins });

  if (!granted) {
    throw new Error(`User denied host permissions for ${combinedOrigins.join(', ')}`);
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
