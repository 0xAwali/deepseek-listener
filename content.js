// Runs inside chat.deepseek.com: types the text into the chat box and sends it.
// NOTE: DeepSeek can change its page structure. If typing/sending stops working,
// adjust findInput() and clickSendButton() below.
(() => {
  // Guard: the script may be injected twice (manifest + programmatic injection)
  if (window.__dsListenerLoaded) return;
  window.__dsListenerLoaded = true;

  function findInput() {
    return (
      document.querySelector("textarea#chat-input") ||
      document.querySelector("textarea")
    );
  }

  async function waitForInput(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = findInput();
      if (el) return el;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function pressEnter(el) {
    const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  function clickSendButton(input) {
    // Fallback: the send control is normally the LAST enabled button-like element near the textarea
    let node = input.parentElement;
    for (let i = 0; i < 5 && node; i++, node = node.parentElement) {
      const btns = [...node.querySelectorAll('[role="button"], button')].filter(
        (b) => b.getAttribute("aria-disabled") !== "true" && !b.disabled
      );
      if (btns.length) {
        btns[btns.length - 1].click();
        return true;
      }
    }
    return false;
  }

  async function ask(text, autoSend) {
    const input = await waitForInput();
    if (!input) return { ok: false, error: "Chat input not found on the DeepSeek page (are you logged in?)." };
    input.focus();
    setNativeValue(input, text);
    if (autoSend) {
      await new Promise((r) => setTimeout(r, 250));
      pressEnter(input);
      // If the text is still in the box a moment later, Enter didn't work -> click send
      await new Promise((r) => setTimeout(r, 500));
      const current = findInput();
      if (current && current.value && current.value.trim()) clickSendButton(current);
    }
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "ask") return;
    chrome.storage.local.get({ autoSend: true }, ({ autoSend }) => {
      ask(msg.text, autoSend)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    });
    return true;
  });
})();
