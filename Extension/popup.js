window.__ONBOARD = window.__ONBOARD || { API_BASE: 'http://localhost:8000', EMPLOYEE_ID: 'emp_001' };
const API_BASE = window.__ONBOARD.API_BASE;
const EMPLOYEE_ID = window.__ONBOARD.EMPLOYEE_ID;

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "refreshTasks") {
        console.log("[ONBOARD.AI] Refreshing task list");
        loadCurrentTask();
    }
});

async function loadCurrentTask() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await fetch(`${API_BASE}/api/employee/task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employee_id: EMPLOYEE_ID,
                current_url: tab.url
            })
        });

        const data = await response.json();
        if (data.has_active_task) displayTask(data.task, data.employee);
        else displayNoTask();
    } catch (error) {
        console.error('Failed to load task:', error);
        displayError();
    }
}

function displayTask(task, employee) {
    const progress = (task.steps_completed / task.total_steps) * 100;
    
    const html = `
        <div class="task-card">
            <div class="task-header">
                <div class="task-icon">📋</div>
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-progress">Step ${task.steps_completed + 1} of ${task.total_steps}</div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="status-badge status-${task.status === 'completed' ? 'complete' : 'active'}">
                ${task.status === 'completed' ? 'Complete' : 'In Progress'}
            </span>
        </div>
        
        <div class="actions">
            <button class="btn btn-primary" id="start-guidance">
                ${task.steps_completed > 0 ? 'Continue Guidance' : 'Start Guidance'}
            </button>
            <button class="btn btn-secondary" id="refresh-task">
                Refresh Task
            </button>
        </div>
        
        <div class="info-section">
            <div class="info-item">
                <span class="info-label">Employee:</span>
                <span class="info-value">${employee.name}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Role:</span>
                <span class="info-value">${employee.role}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Task Type:</span>
                <span class="info-value">${task.type.replace(/_/g, ' ')}</span>
            </div>
        </div>
    `;
    
    document.getElementById('task-container').innerHTML = html;
    
    document.getElementById('start-guidance').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: 'start_guidance' });
        window.close();
    });
    
    document.getElementById('refresh-task').addEventListener('click', () => {
        loadCurrentTask();
    });
}

function displayNoTask() {
    const html = `
        <div class="no-task">
            <div class="no-task-icon">✅</div>
            <p><strong>No active tasks</strong></p>
            <p style="margin-top: 8px; font-size: 13px;">You're all caught up! Check back later for new onboarding tasks.</p>
        </div>
        <div class="actions" style="margin-top: 16px;">
            <button class="btn btn-secondary" id="check-again">
                Check Again
            </button>
        </div>
    `;
    
    document.getElementById('task-container').innerHTML = html;
    
    document.getElementById('check-again').addEventListener('click', () => {
        loadCurrentTask();
    });
}

function displayError() {
    const html = `
        <div class="no-task">
            <div class="no-task-icon">⚠️</div>
            <p><strong>Connection Error</strong></p>
            <p style="margin-top: 8px; font-size: 13px;">Unable to connect to ONBOARD.AI backend. Make sure the server is running.</p>
        </div>
        <div class="actions" style="margin-top: 16px;">
            <button class="btn btn-primary" id="retry">
                Retry
            </button>
        </div>
    `;
    
    document.getElementById('task-container').innerHTML = html;
    
    document.getElementById('retry').addEventListener('click', () => {
        loadCurrentTask();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentTask();

    chrome.tabs.onActivated.addListener(() => {
        loadCurrentTask();
    });
});
