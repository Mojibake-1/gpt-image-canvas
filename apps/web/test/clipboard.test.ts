import assert from "node:assert/strict";
import test from "node:test";
import { writeClipboardText } from "../src/shared/clipboard.ts";

type ClipboardStub = {
  writeText?: (text: string) => Promise<void>;
};

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

function setGlobalValue(name: "navigator" | "document", value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value
  });
}

function restoreGlobals(): void {
  setGlobalValue("navigator", originalNavigator);
  setGlobalValue("document", originalDocument);
}

function installClipboard(clipboard: ClipboardStub): void {
  setGlobalValue("navigator", { clipboard });
}

function installLegacyDocument(options: { execResult: boolean }): { appendedValues: string[]; removed: () => boolean } {
  const appendedValues: string[] = [];
  let removed = false;
  let selected = false;

  setGlobalValue("document", {
    body: {
      append(element: { value: string }) {
        appendedValues.push(element.value);
      }
    },
    createElement(tagName: string) {
      assert.equal(tagName, "textarea");
      return {
        value: "",
        readOnly: false,
        style: {},
        setAttribute() {},
        focus() {},
        select() {
          selected = true;
        },
        setSelectionRange(start: number, end: number) {
          assert.equal(start, 0);
          assert.ok(end > 0);
        },
        remove() {
          removed = true;
        }
      };
    },
    execCommand(command: string) {
      assert.equal(command, "copy");
      assert.equal(selected, true);
      return options.execResult;
    }
  });

  return {
    appendedValues,
    removed: () => removed
  };
}

test.afterEach(() => {
  restoreGlobals();
});

test("writeClipboardText uses the native Clipboard API when it succeeds", async () => {
  let written = "";
  installClipboard({
    async writeText(text) {
      written = text;
    }
  });

  await writeClipboardText("hello");

  assert.equal(written, "hello");
});

test("writeClipboardText falls back when the native Clipboard API is denied", async () => {
  installClipboard({
    async writeText() {
      throw new Error("NotAllowedError");
    }
  });
  const documentState = installLegacyDocument({ execResult: true });

  await writeClipboardText("fallback text");

  assert.deepEqual(documentState.appendedValues, ["fallback text"]);
  assert.equal(documentState.removed(), true);
});

test("writeClipboardText reports failure when both native and legacy copy fail", async () => {
  installClipboard({
    async writeText() {
      throw new Error("NotAllowedError");
    }
  });
  installLegacyDocument({ execResult: false });

  await assert.rejects(() => writeClipboardText("blocked"), /NotAllowedError/);
});
