import type { Menus, Runtime, Tabs } from 'webextension-polyfill';
import { getHosts } from './hosts/hosts';
import { Message, MessageAction } from './models/messaging';
import { browser } from './utils/browser';
import { sendToContent } from './utils/messaging';
import { request, requiredPermissions } from './utils/request';

declare global {
  const PARSER_NAMES: string[];
}

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

  if (permissionOrigins.length > 0) {
    await browser.permissions.request({ origins: permissionOrigins });
  }

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

async function sendTask(tabId: number, messageId: string, data: string): Promise<void> {
  try {
    // 1. 解析傳入的資料
    const parsedData = JSON.parse(data);
    const targetUrl = 'https://cpp.doong.me/*';
    const targetEntry = 'https://cpp.doong.me/';
    const eventPayload = parsedData.eventPayload ?? parsedData;

    const permissionGranted = await browser.permissions.request({ origins: [targetUrl] });
    if (!permissionGranted) {
      throw new Error('Permission denied for https://cpp.doong.me/*');
    }

    let targetTabId: number;

    // 2. 尋找是否已經有開啟該網址的分頁 (使用 browser.tabs)
    const tabs = await browser.tabs.query({ url: targetUrl });

    if (tabs.length > 0) {
      // 3a. 如果存在，取第一個找到的分頁並切換過去
      targetTabId = tabs[0].id!;

      await browser.tabs.update(targetTabId, { active: true });

      // 確保該分頁所在的視窗被拉到最上層
      if (tabs[0].windowId) {
        await browser.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      // 3b. 如果不存在，開啟一個新分頁
      const newTab = await browser.tabs.create({ url: targetEntry, active: true });
      targetTabId = newTab.id!;

      // 等待新分頁載入完成
      await waitForTabLoad(targetTabId);
    }

    // 4. 在頁面主世界觸發 ext 事件，讓站點可以直接 window.addEventListener('ext', ...) 監聽
    await dispatchExtEvent(targetTabId, eventPayload);

    // 5. 任務成功，回傳結果給原本發起請求的 Content Script
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
