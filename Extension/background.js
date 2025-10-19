// background.js - Extension background service worker

const API_BASE = 'http://localhost:8000';

// Listen for tab updates to detect navigation to tracked sites
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        checkIfTaskRelevant(tabId, tab.url);
    }
});

async function checkIfTaskRelevant(tabId, url) {
    // Check if URL is a tracked site (GitHub, VS Code online, etc.)
    const trackedSites = ['github.com'];
    
    const isTracked = trackedSites.some(site => url.includes(site));
    
    if (isTracked) {
        // Notify content script that it should activate
        chrome.tabs.sendMessage(tabId, {
            action: 'check_task',
            url: url
        }).catch(err => {
            // Content script might not be ready yet
            console.log('Content script not ready:', err);
        });
        
        // Update extension badge
        chrome.action.setBadgeText({ 
            text: '!', 
            tabId: tabId 
        });
        chrome.action.setBadgeBackgroundColor({ 
            color: '#8b5cf6' 
        });
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Proxy fetch requests from content scripts (avoids mixed-content blocks)
        if (request.action === 'proxy_fetch') {
        const { url, fetchOptions } = request;

        fetch(url, fetchOptions)
            .then(async res => {
                const contentType = res.headers.get('content-type') || '';
                let body = contentType.includes('application/json')
                    ? await res.json()
                    : await res.text();

                sendResponse({ ok: res.ok, status: res.status, body });

                // ✅ Refresh popup only if a task was created or progress updated
                if (url.includes('/api/task/create') || url.includes('/api/task/progress')) {
                    console.log('[ONBOARD.AI] Task state changed — triggering popup refresh');
                    chrome.runtime.sendMessage({ action: 'refreshTasks' });
                }
            })
            .catch(err => sendResponse({ ok: false, error: String(err) }));

        return true; // Keep channel open for async response
    }

    if (request.action === 'task_completed') {
        // Show notification
        chrome.notifications.create({
            type: 'basic',
            title: 'Task Completed! 🎉',
            message: `Great job completing: ${request.task_title}`,
            priority: 2
        });
        
        // Clear badge
        chrome.action.setBadgeText({ 
            text: '', 
            tabId: sender.tab.id 
        });
    }
    
    if (request.action === 'task_started') {
        // Update badge with step number
        chrome.action.setBadgeText({ 
            text: String(request.step), 
            tabId: sender.tab.id 
        });
    }
    
    return true; // Keep message channel open for async response
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    // Inject content script if not already present
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

console.log('ONBOARD.AI background service worker loaded');