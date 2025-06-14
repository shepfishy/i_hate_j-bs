document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('enableCensorToggle');

    // Load saved state
    chrome.storage.sync.get(['censoringEnabled'], (result) => {
        toggle.checked = result.censoringEnabled !== undefined ? result.censoringEnabled : true; // Default to true
    });

    // Save state and notify content script on change
    toggle.addEventListener('change', () => {
        const enabled = toggle.checked;
        chrome.storage.sync.set({ censoringEnabled: enabled });

        // Send message to active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "toggleCensoring", enabled: enabled });
            }
        });
    });
});