// Opens the listener window when the toolbar icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: "listener.html",
    type: "popup",
    width: 440,
    height: 620
  });
});

// Receives transcribed text and forwards it to the DeepSeek tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ask") return;
  forwardToDeepSeek(msg.text)
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // async response
});

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("DeepSeek page took too long to load."));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // In case it already finished loading before the listener was attached
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === "complete") listener(tabId, { status: "complete" });
    }).catch(() => {});
  });
}

async function sendToTab(tabId, text) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "ask", text });
  } catch (_) {
    // Content script not present (tab was open before the extension loaded): inject it, retry once.
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise((r) => setTimeout(r, 300));
    return await chrome.tabs.sendMessage(tabId, { type: "ask", text });
  }
}

async function forwardToDeepSeek(text) {
  let tabs = await chrome.tabs.query({ url: "https://chat.deepseek.com/*" });
  let tab;
  if (tabs.length) {
    tab = tabs[0];
  } else {
    tab = await chrome.tabs.create({ url: "https://chat.deepseek.com/", active: false });
    await waitForTabComplete(tab.id);
  }
  try {
    return await sendToTab(tab.id, text);
  } catch (e) {
    return { ok: false, error: "Could not reach the DeepSeek tab. Reload it once, then try again." };
  }
}
