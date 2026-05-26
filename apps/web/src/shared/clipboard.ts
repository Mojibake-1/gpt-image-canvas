export async function writeClipboardText(text: string): Promise<void> {
  let nativeError: unknown;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      nativeError = error;
    }
  }

  try {
    writeClipboardTextWithTextarea(text);
  } catch (legacyError) {
    throw nativeError ?? legacyError;
  }
}

function writeClipboardTextWithTextarea(text: string): void {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.readOnly = true;
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  textArea.style.opacity = "0";
  document.body.append(textArea);

  try {
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Copy command was not accepted.");
    }
  } finally {
    textArea.remove();
  }
}
