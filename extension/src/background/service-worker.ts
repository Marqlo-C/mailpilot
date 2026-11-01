// Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Automatically open the side panel when the user clicks the toolbar icon
  if (chrome.sidePanel && "setPanelBehavior" in chrome.sidePanel) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.warn("Failed to set side panel behavior:", error));
  }
});

chrome.action?.onClicked?.addListener(async (tab) => {
  if (tab.windowId && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn("Could not open side panel directly:", err);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true, timestamp: Date.now() });
  }
  return true;
});
