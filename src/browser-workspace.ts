export type ThemeName = 'classic' | 'contrastful' | 'light';
export type ChatColour = 'cyan' | 'violet' | 'green' | 'amber';
export type BrowserWorkspace = {
  version: 1; selected: string; order: string[]; drafts: Record<string, string>;
  positions: Record<string, number>; bottom: Record<string, boolean>;
  overviewWidth?: number;
  composerHeight?: number;
  overviewHeights?: Record<string, number>;
  theme?: ThemeName;
  chatColours?: Record<string, ChatColour>;
  taskWatches?: Record<string, string[]>;
};
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export const BROWSER_WORKSPACE_KEY = 'ccng.workspace.v1';
export const emptyBrowserWorkspace = (): BrowserWorkspace => ({ version: 1, selected: '', order: [], drafts: {}, positions: {}, bottom: {} });
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) && !['constructor', 'prototype'].includes(id);
const validTheme = (value: unknown): value is ThemeName => value === 'classic' || value === 'contrastful' || value === 'light';
const validChatColour = (value: unknown): value is ChatColour => value === 'cyan' || value === 'violet' || value === 'green' || value === 'amber';
const validTaskId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value) && !['constructor', 'prototype'].includes(value);
const entries = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).filter(([key]) => validId(key)).slice(-32) : [];
export function browserWorkspace(value: unknown): BrowserWorkspace {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return emptyBrowserWorkspace();
  const data = value as Partial<BrowserWorkspace>;
  return {
    version: 1, selected: validId(data.selected) ? data.selected : '',
    order: Array.isArray(data.order) ? [...new Set(data.order.filter(validId))].slice(0, 32) : [],
    drafts: Object.fromEntries(entries(data.drafts).filter(([, text]) => typeof text === 'string' && text.length <= 32000)),
    positions: Object.fromEntries(entries(data.positions).filter(([, position]) => typeof position === 'number' && Number.isFinite(position) && position >= 0)),
    bottom: Object.fromEntries(entries(data.bottom).filter(([, value]) => typeof value === 'boolean')),
    ...(typeof data.composerHeight === 'number' && Number.isFinite(data.composerHeight) && data.composerHeight >= 80 && data.composerHeight <= 1200 ? { composerHeight: data.composerHeight } : {}),
    ...(typeof data.overviewWidth === 'number' && Number.isFinite(data.overviewWidth) && data.overviewWidth >= 280 && data.overviewWidth <= 800 ? { overviewWidth: data.overviewWidth } : {}),
    ...(data.overviewHeights ? { overviewHeights: Object.fromEntries(entries(data.overviewHeights).filter(([key, height]) => ['branch', 'goal', 'recap', 'tasks', 'questions', 'chat-questions', 'settings', 'coordinator', 'workers', 'coordinator-questions', 'decisions'].includes(key) && typeof height === 'number' && Number.isFinite(height) && height >= 64 && height <= 1200)) } : {}),
    ...(validTheme(data.theme) ? { theme: data.theme } : {}),
    ...(data.chatColours && typeof data.chatColours === 'object' && !Array.isArray(data.chatColours) ? {
      chatColours: Object.fromEntries(entries(data.chatColours).filter(([, colour]) => validChatColour(colour)))
    } : {}),
    ...(data.taskWatches && typeof data.taskWatches === 'object' && !Array.isArray(data.taskWatches) ? {
      taskWatches: Object.fromEntries(entries(data.taskWatches).filter(([, ids]) => Array.isArray(ids)).map(([workerId, ids]) => [workerId, [...new Set((ids as unknown[]).filter(validTaskId))].slice(0, 128)]))
    } : {})
  };
}
export function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
export function loadBrowserWorkspace(storage = browserStorage()): { state: BrowserWorkspace; error: string | null } {
  try {
    if (!storage) throw new Error('Browser storage is unavailable.');
    const text = storage.getItem(BROWSER_WORKSPACE_KEY);
    if (text && text.length > 1_500_000) throw new Error('Saved browser workspace is too large.');
    return { state: text ? browserWorkspace(JSON.parse(text)) : emptyBrowserWorkspace(), error: null };
  } catch { return { state: emptyBrowserWorkspace(), error: 'Browser workspace could not be read. Drafts and tab order will work in memory.' }; }
}
export function saveBrowserWorkspace(value: BrowserWorkspace, storage = browserStorage()): string | null {
  try {
    if (!storage) throw new Error('Browser storage is unavailable.');
    storage.setItem(BROWSER_WORKSPACE_KEY, JSON.stringify(browserWorkspace(value))); return null;
  } catch { return 'Browser workspace could not be saved. Drafts and tab order currently stay in memory.'; }
}
