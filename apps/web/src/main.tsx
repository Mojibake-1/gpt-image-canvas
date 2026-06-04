// 尽早建立外壳主题桥：在 React 渲染前就读 URL 烘焙的 muxing-theme、
// 挂上 postMessage 监听、并向外壳主动 request-theme，最大限度减少主题闪烁。
import "./features/canvas/shell-theme-bridge";
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { LanguageProvider } from "./i18n";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
);
