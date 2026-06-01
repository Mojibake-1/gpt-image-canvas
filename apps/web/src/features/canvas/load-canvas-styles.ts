import canvasAppStylesheetUrl from "../../canvas-app.css?url";
import { tldrawStylesheetUrl } from "virtual:canvas-runtime-assets";

const STYLE_URLS = [tldrawStylesheetUrl, canvasAppStylesheetUrl];

function loadStylesheet(href: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLLinkElement>(
    `link[rel="stylesheet"][href="${href}"]`
  );
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.canvasRuntimeStyle = "1";
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(link);
  });
}

let stylesReady: Promise<void> | null = null;

export function loadCanvasStyles(): Promise<void> {
  stylesReady ??= Promise.all(STYLE_URLS.map(loadStylesheet)).then(() => undefined);
  return stylesReady;
}
