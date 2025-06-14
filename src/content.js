let isCensoringEnabled = true; // Default state

const jobWords = [
  "job", "career", "employment", "resume", "application",
  "interview", "applicant", "reference", "contract",
  "portfolio", "intern", "internship", "promotion", "hiring", "recruitment",
  "qualification", "certification", "license", "upskilling",
  "experience", "skills", "discipline", "focus",
  "motivation", "independence", "initiative", "reliable",
  "punctuality", "attendance", "responsibility", "dedication",
  "commitment", "effort", "professionalism", "confidence",
  "attitude", "growth", "ambition",
  "credibility", "presentation", "readiness", "drive",
  "preparation", "training", "onboarding", "learning",
  "selfstarter", "talent", "aptitude", "suitability",
];

// Escape special regex characters in words and create a single regex
const escapedJobWords = jobWords.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const combinedRegex = new RegExp(`\\b(${escapedJobWords.join('|')})(s)?\\b`, 'gi');

const censorWord = (text) => {
    if (!isCensoringEnabled) return text;
    return text.replace(combinedRegex, (match) => {
        if (match.length <= 1) return match;
        if (match.length === 2) return match[0] + '*';
        return match[0] + '*'.repeat(match.length - 2) + match.slice(-1);
    });
};

const walkTextNodes = (node) => {
    if (!isCensoringEnabled) return;

    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.nodeName === 'TEXTAREA' || (node.nodeName === 'INPUT')) {
        return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        const currentText = node.textContent;
        if (currentText && currentText.trim() !== '') {
            const newText = censorWord(currentText);
            if (newText !== currentText) {
                node.textContent = newText;
            }
        }
    } else {
        for (let i = 0; i < node.childNodes.length; i++) {
            walkTextNodes(node.childNodes[i]);
        }
    }
};

// Function to handle input changes for input/textarea elements
const handleInputChange = (event) => {
    if (!isCensoringEnabled) return;

    const inputElement = event.target;
    const originalValue = inputElement.value;
    const censoredValue = censorWord(originalValue);

    if (originalValue !== censoredValue) {
        const selectionStart = inputElement.selectionStart;
        const selectionEnd = inputElement.selectionEnd;
        
        inputElement.value = censoredValue;
        
        // Restore cursor position. Since censorWord preserves the length of the matched word,
        // this should generally maintain the cursor position correctly.
        if (inputElement.setSelectionRange) {
            inputElement.setSelectionRange(selectionStart, selectionEnd);
        }
    }
};

// Function to add input event listeners to an element and its relevant descendants
const addInputListeners = (element) => {
    if (element.nodeType !== Node.ELEMENT_NODE) return; // Only process element nodes

    const elementsToListen = [];
    // Check if the element itself is an input/textarea
    if (element.matches('input[type="text"], input[type="search"], textarea')) {
        elementsToListen.push(element);
    }
    // Find all relevant input/textarea descendants
    element.querySelectorAll('input[type="text"], input[type="search"], textarea').forEach(el => {
        if (!elementsToListen.includes(el)) { // Avoid adding if already included (e.g. element itself)
            elementsToListen.push(el);
        }
    });

    elementsToListen.forEach(el => {
        el.removeEventListener('input', handleInputChange); // Prevent duplicate listeners
        if (isCensoringEnabled) { // Only add listener if enabled
            el.addEventListener('input', handleInputChange);
        }
    });
};

const reapplyCensoring = () => {
    if (isCensoringEnabled) {
        walkTextNodes(document.body);
        addInputListeners(document.body);
    }
    // If disabling, we don't attempt to "uncensor" as that's complex.
    // We just stop future censoring and remove input listeners.
    // Existing input listeners are managed by addInputListeners re-evaluation.
    if (!isCensoringEnabled) {
        // Remove listeners if censoring gets disabled
        document.querySelectorAll('input[type="text"], input[type="search"], textarea').forEach(el => {
            el.removeEventListener('input', handleInputChange);
        });
    }
};


// Load initial state and apply
chrome.storage.sync.get(['censoringEnabled'], (result) => {
    isCensoringEnabled = result.censoringEnabled !== undefined ? result.censoringEnabled : true;
    if (isCensoringEnabled) {
        walkTextNodes(document.body);
        addInputListeners(document.body);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleCensoring") {
        isCensoringEnabled = request.enabled;
        // Re-evaluate censoring on the page based on the new state
        reapplyCensoring(); 
        // Optionally, you could send a response back to the popup
        sendResponse({ status: "Censoring state updated" });
    }
    return true; // Indicates you wish to send a response asynchronously
});

// Observe DOM changes
const observer = new MutationObserver((mutationsList) => {
    if (!isCensoringEnabled) return; // Don't do anything if not enabled

    observer.disconnect();

    for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(newNode => {
                walkTextNodes(newNode);
                if (newNode.nodeType === Node.ELEMENT_NODE) {
                    addInputListeners(newNode);
                }
            });
        } else if (mutation.type === 'characterData') {
            if (mutation.target.nodeType === Node.TEXT_NODE) {
                const parentNodeName = mutation.target.parentNode ? mutation.target.parentNode.nodeName : '';
                if (parentNodeName !== 'SCRIPT' && parentNodeName !== 'STYLE' && parentNodeName !== 'INPUT' && parentNodeName !== 'TEXTAREA') {
                    const currentText = mutation.target.textContent;
                    if (currentText && currentText.trim() !== '') {
                        const newText = censorWord(currentText);
                        if (newText !== currentText) {
                            mutation.target.textContent = newText;
                        }
                    }
                }
            }
        }
    }

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
});

// Start observing if enabled initially
chrome.storage.sync.get(['censoringEnabled'], (result) => {
    if (result.censoringEnabled !== undefined ? result.censoringEnabled : true) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
});

// Also, need to start/stop observer when toggled via message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleCensoring") {
        // isCensoringEnabled is already updated by the other listener
        if (isCensoringEnabled) {
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        } else {
            observer.disconnect();
        }
    }
});

// Consolidate observer start/stop logic
function updateObserverState() {
    if (isCensoringEnabled) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    } else {
        observer.disconnect();
    }
}

// Initial observer state based on storage
chrome.storage.sync.get(['censoringEnabled'], (result) => {
    isCensoringEnabled = result.censoringEnabled !== undefined ? result.censoringEnabled : true;
    if (isCensoringEnabled) {
        walkTextNodes(document.body);
        addInputListeners(document.body);
    }
    updateObserverState(); // Set initial observer state
});

// Listen for messages from popup (this replaces the previous separate listeners for onMessage)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleCensoring") {
        isCensoringEnabled = request.enabled;
        reapplyCensoring();
        updateObserverState(); // Update observer based on new state
        sendResponse({ status: "Censoring state updated" });
    }
    return true; 
});