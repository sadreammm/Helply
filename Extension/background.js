const API_BASE = 'http://localhost:8000';

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        checkIfTaskRelevant(tabId, tab.url);
    }
});

async function checkIfTaskRelevant(tabId, url) {
    const trackedSites = ['github.com'];
    
    const isTracked = trackedSites.some(site => url.includes(site));
    
    if (isTracked) {
        chrome.tabs.sendMessage(tabId, {
            action: 'check_task',
            url: url
        }).catch(err => {
            console.log('Content script not ready:', err);
        });
        
        chrome.action.setBadgeText({ 
            text: '!', 
            tabId: tabId 
        });
        chrome.action.setBadgeBackgroundColor({ 
            color: '#8b5cf6' 
        });
    }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'proxy_fetch') {
        const { url, fetchOptions } = request;

        fetch(url, fetchOptions)
            .then(async res => {
                const contentType = res.headers.get('content-type') || '';
                let body = contentType.includes('application/json')
                    ? await res.json()
                    : await res.text();

                sendResponse({ ok: res.ok, status: res.status, body });

                if (url.includes('/api/task/create') || url.includes('/api/task/progress')) {
                    console.log('[ONBOARD.AI] Task state changed — triggering popup refresh');
                    chrome.runtime.sendMessage({ action: 'refreshTasks' });
                }
            })
            .catch(err => sendResponse({ ok: false, error: String(err) }));

        return true; 
    }

    if (request.action === 'task_completed') {
        chrome.notifications.create({
            type: 'basic',
            title: 'Task Completed!',
            message: `Great job completing: ${request.task_title}`,
            priority: 2
        });
        
        chrome.action.setBadgeText({ 
            text: '', 
            tabId: sender.tab.id 
        });
    }
    
    if (request.action === 'task_started') {
        chrome.action.setBadgeText({ 
            text: String(request.step), 
            tabId: sender.tab.id 
        });
    }
    
    return true;
});

chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
});

console.log('ONBOARD.AI background service loaded');
