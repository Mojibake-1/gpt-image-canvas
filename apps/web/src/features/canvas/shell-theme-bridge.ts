import { useSyncExternalStore } from "react";

/**
 * 外壳主题桥（子页侧握手）
 *
 * 沐星工具站外壳通过 postMessage 把主题传给内嵌的 AI 画布 iframe：
 *   { source: "muxing-workbench", type: "muxing:set-theme", theme }
 * 外壳同时把 `muxing-theme=<theme>` 烘焙进 iframe 的 URL，子页启动时即可读取，避免闪烁。
 * 子页可主动向外壳请求当前主题：
 *   { source: "muxing-tool", type: "muxing:request-theme" }
 *
 * theme 取值：'' (晨光) / 'nature' / 'stellar' / 'light' / 'dark'
 *
 * 本桥只负责把外壳主题映射成 Canvas 自己的明/暗色态（'light' | 'dark'），
 * 然后交给 Canvas 现有的 tldraw colorScheme 机制激活——不新造一套主题系统，
 * 也不改动赤陶 #c65f32 的身份配色。
 */

export type CanvasColorScheme = "light" | "dark";

const WORKBENCH_SOURCE = "muxing-workbench";
const TOOL_SOURCE = "muxing-tool";
const SET_THEME_TYPE = "muxing:set-theme";
const REQUEST_THEME_TYPE = "muxing:request-theme";

// 外壳的 'stellar' / 'dark' → Canvas 暗色；其余（''/晨光、'nature'、'light'）→ Canvas 浅色。
const DARK_SHELL_THEMES = new Set(["stellar", "dark"]);

function mapShellThemeToColorScheme(theme: unknown): CanvasColorScheme | null {
  if (typeof theme !== "string") {
    return null;
  }
  return DARK_SHELL_THEMES.has(theme) ? "dark" : "light";
}

// 仅当外壳没有提供任何主题时，才返回 null（让 Canvas 沿用自身默认：跟随系统）。
function readInitialShellTheme(): CanvasColorScheme | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("muxing-theme") ?? params.get("theme");
    if (raw === null) {
      return null;
    }
    return mapShellThemeToColorScheme(raw);
  } catch {
    return null;
  }
}

let currentScheme: CanvasColorScheme | null = readInitialShellTheme();
const listeners = new Set<() => void>();

function setScheme(next: CanvasColorScheme | null): void {
  if (next === null || next === currentScheme) {
    return;
  }
  currentScheme = next;
  for (const listener of listeners) {
    listener();
  }
}

function isWorkbenchSetThemeMessage(data: unknown): data is { source: string; type: string; theme: unknown } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === WORKBENCH_SOURCE &&
    (data as { type?: unknown }).type === SET_THEME_TYPE
  );
}

let initialised = false;

function ensureBridge(): void {
  if (initialised || typeof window === "undefined") {
    return;
  }
  initialised = true;

  window.addEventListener("message", (event: MessageEvent) => {
    if (!isWorkbenchSetThemeMessage(event.data)) {
      return;
    }
    setScheme(mapShellThemeToColorScheme(event.data.theme));
  });

  // 启动时向外壳主动请求当前主题（覆盖 URL 未烘焙、或外壳后续才就绪的情况）。
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ source: TOOL_SOURCE, type: REQUEST_THEME_TYPE }, "*");
    } catch {
      // 跨域 parent 可能抛错——忽略，message 监听仍会接收外壳推送。
    }
  }
}

// 模块加载即建立握手，尽早接收外壳推送，减少主题闪烁。
ensureBridge();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CanvasColorScheme | null {
  return currentScheme;
}

/**
 * 返回外壳指定的 Canvas 色彩方案；外壳从未提供时返回 null。
 * 调用方应在为 null 时保留 Canvas 自身默认（跟随系统），不要强制覆盖。
 */
export function useShellColorScheme(): CanvasColorScheme | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 同步读取当前外壳色彩方案（用于 React 状态的惰性初始化，避免首帧主题闪烁）。
 */
export function getShellColorScheme(): CanvasColorScheme | null {
  return currentScheme;
}
