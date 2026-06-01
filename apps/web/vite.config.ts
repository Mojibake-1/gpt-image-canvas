import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8787";
const require = createRequire(import.meta.url);

function emitCanvasRuntimeAssets(): Plugin {
  const virtualId = "virtual:canvas-runtime-assets";
  const resolvedVirtualId = "\0" + virtualId;

  function getTldrawStylesheetAsset() {
    const source = readFileSync(require.resolve("tldraw/tldraw.css"));
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 10);
    return {
      fileName: `assets/tldraw-${hash}.css`,
      source
    };
  }

  return {
    name: "emit-canvas-runtime-assets",
    resolveId(id: string) {
      if (id === virtualId) return resolvedVirtualId;
      return null;
    },
    load(id: string) {
      if (id !== resolvedVirtualId) return null;
      const { fileName } = getTldrawStylesheetAsset();
      return `export const tldrawStylesheetUrl = ${JSON.stringify("/" + fileName)};`;
    },
    generateBundle() {
      const { fileName, source } = getTldrawStylesheetAsset();
      this.emitFile({
        type: "asset",
        fileName,
        source
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    emitCanvasRuntimeAssets()
  ],
  resolve: {
    alias: {
      "@gpt-image-canvas/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
  build: {
    modulePreload: {
      polyfill: false,
      resolveDependencies() {
        return [];
      }
    },
    // Keep only shell-critical vendor chunks eager. Do not force a standalone
    // tldraw group here: in Vite 8/Rolldown it makes the entry import the
    // preload helper from the tldraw chunk, defeating the lazy canvas boundary.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ }
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
