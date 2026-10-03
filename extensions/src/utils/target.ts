import { browser } from './browser';

export const DEFAULT_TARGET_URL = 'https://cpp.doong.me/editor/*';

/**
 * Human-readable version of the target hosts the manifest allows, see scripts/build/extension.ts.
 */
export const ALLOWED_TARGETS_DESCRIPTION =
  'https://cpp.doong.me, a local dev server on localhost or 127.0.0.1 (any port), or a preview deployment on *.cpp-insiders.doong.me';

export interface TargetUrl {
  /** Match pattern for the editor tabs, e.g. https://cpp.doong.me/editor/* */
  pattern: string;
  /** URL to open when no editor tab exists, e.g. https://cpp.doong.me/editor/ */
  entry: string;
}

export type TargetUrlCheck = TargetUrl | { error: string };

export function normalizeTargetUrl(rawTargetUrl: string): TargetUrl {
  const trimmed = rawTargetUrl.trim();
  const candidate = trimmed.length > 0 ? trimmed : DEFAULT_TARGET_URL;

  const entry = candidate.endsWith('/*') ? candidate.slice(0, -1) : candidate;
  const pattern = entry.endsWith('/*') ? entry : `${entry.replace(/\/$/, '')}/*`;

  return { pattern, entry: entry.replace(/\/$/, '') + '/' };
}

/**
 * Checks whether the extension can be granted access to a target URL. Browsers only let an extension request
 * hosts listed in its manifest, so anything else fails with a cryptic error when the toolbar button is clicked.
 */
export function checkTargetUrl(rawTargetUrl: string): TargetUrlCheck {
  const target = normalizeTargetUrl(rawTargetUrl);

  let url: URL;
  try {
    url = new URL(target.entry);
  } catch {
    return { error: `"${rawTargetUrl.trim()}" is not a valid URL.` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'The target URL must start with http:// or https://.' };
  }

  if (!getManifestHostPatterns().some(pattern => matchesPattern(pattern, url))) {
    return {
      error: `C++ Here can't be given access to ${url.host}. The target URL must be on ${ALLOWED_TARGETS_DESCRIPTION}.`,
    };
  }

  return target;
}

function getManifestHostPatterns(): string[] {
  const manifest = browser.runtime.getManifest() as Record<string, any>;

  // Firefox lists optional hosts under optional_permissions, mixed with API permissions
  const permissions: string[] = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
    ...(manifest.optional_permissions ?? []),
  ];

  return permissions.filter(permission => permission === '<all_urls>' || permission.includes('://'));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a URL matches a WebExtension match pattern. A pattern without a port matches any port.
 */
function matchesPattern(pattern: string, url: URL): boolean {
  if (pattern === '<all_urls>') {
    return true;
  }

  const match = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (match === null) {
    return false;
  }

  const [, scheme, hostAndPort, path] = match;

  if (scheme !== '*' && url.protocol !== `${scheme}:`) {
    return false;
  }

  const [host, port] = hostAndPort.split(':');

  if (port !== undefined && port !== '*') {
    const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (port !== urlPort) {
      return false;
    }
  }

  const hostMatches =
    host === '*' ||
    url.hostname === host ||
    (host.startsWith('*.') && (url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))));
  if (!hostMatches) {
    return false;
  }

  const pathRegExp = new RegExp(`^${path.split('*').map(escapeRegExp).join('.*')}$`);
  return pathRegExp.test(url.pathname);
}
