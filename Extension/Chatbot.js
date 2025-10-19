// Chatbot.js - FIXED VERSION

window.__ONBOARD = window.__ONBOARD || { API_BASE: 'http://localhost:8000', EMPLOYEE_ID: 'emp_001' };
const API_BASE = window.__ONBOARD.API_BASE;
const EMPLOYEE_ID = window.__ONBOARD.EMPLOYEE_ID;

class OnboardPopup {
    constructor() {
        this.currentView = 'task';
        this.currentTask = null;
        this.currentContext = null;
        this.pendingTask = null;
        
        this.taskView = document.getElementById('taskView');
        this.chatView = document.getElementById('chatView');
        this.taskModeBtn = document.getElementById('taskModeBtn');
        this.chatModeBtn = document.getElementById('chatModeBtn');
        this.headerSubtitle = document.getElementById('headerSubtitle');
        
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        
        this.taskContent = document.getElementById('taskContent');
        
        this.init();
    }
    
    async init() {
        await this.loadContext();
        await this.loadTask();
        
        this.taskModeBtn.addEventListener('click', () => this.switchView('task'));
        this.chatModeBtn.addEventListener('click', () => this.switchView('chat'));
        
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
        
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchView('chat');
                setTimeout(() => {
                    this.chatInput.value = btn.dataset.action;
                    this.handleSend();
                }, 100);
            });
        });
    }
    
    async loadContext() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentContext = {
                url: tab.url,
                title: tab.title,
                tabId: tab.id
            };
        } catch (error) {
            console.error('Failed to load context:', error);
        }
    }
    
    switchView(view) {
        this.currentView = view;
        
        if (view === 'task') {
            this.taskModeBtn.classList.add('active');
            this.chatModeBtn.classList.remove('active');
            this.taskView.classList.add('active');
            this.chatView.classList.remove('active');
            this.headerSubtitle.textContent = 'Your Tasks';
        } else {
            this.chatModeBtn.classList.add('active');
            this.taskModeBtn.classList.remove('active');
            this.chatView.classList.add('active');
            this.taskView.classList.remove('active');
            this.headerSubtitle.textContent = 'Chat Assistant';
            setTimeout(() => this.chatInput.focus(), 100);
        }
    }
    
    async loadTask() {
        try {
            const response = await fetch(`${API_BASE}/api/employee/task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: EMPLOYEE_ID,
                    current_url: this.currentContext.url
                })
            });
            
            const data = await response.json();
            
            if (data.has_active_task) {
                this.currentTask = data.task;
                this.displayTask(data.task, data.employee);
            } else {
                this.displayNoTask();
            }
        } catch (error) {
            console.error('Failed to load task:', error);
            this.displayError();
        }
    }
    
    displayTask(task, employee) {
        const progress = (task.steps_completed / task.total_steps) * 100;
        
        const html = `
            <div class="current-task-card">
                <div class="task-header">
                    <div class="task-icon">📋</div>
                    <div class="task-info">
                        <div class="task-title">${task.title}</div>
                        <div class="task-progress-text">Step ${task.steps_completed + 1} of ${task.total_steps}</div>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="task-meta">
                    <span class="status-badge status-${task.status === 'completed' ? 'complete' : 'active'}">
                        ${task.status === 'completed' ? '✓ Complete' : '⏱ In Progress'}
                    </span>
                    <span class="task-platform">${this.capitalize(task.platform)}</span>
                </div>
                <div class="task-actions">
                    <button class="btn btn-primary" id="startGuidanceBtn">
                        ${task.steps_completed > 0 ? '▶ Continue Guidance' : '🚀 Start Guidance'}
                    </button>
                    <button class="btn btn-secondary" id="refreshBtn">🔄</button>
                </div>
            </div>
            
            <div class="section-title">Employee Info</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Name</div>
                    <div class="info-value">${employee.name}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Role</div>
                    <div class="info-value">${employee.role}</div>
                </div>
            </div>
            
            <div class="section-title">Need different task?</div>
            <button class="btn btn-primary" style="width: 100%;" id="switchToChatBtn">
                💬 Ask AI Assistant
            </button>
        `;
        
        this.taskContent.innerHTML = html;
        
        document.getElementById('startGuidanceBtn').addEventListener('click', () => {
            this.startGuidance(task);
        });
        
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadTask();
        });
        
        document.getElementById('switchToChatBtn').addEventListener('click', () => {
            this.switchView('chat');
        });
    }
    
    displayNoTask() {
        const html = `
            <div class="no-task">
                <div class="no-task-icon">✅</div>
                <p><strong>No active tasks on this page</strong></p>
                <p style="margin-top: 8px; font-size: 13px; line-height: 1.5;">
                    Navigate to a supported platform or chat with the AI assistant to create a new task.
                </p>
            </div>
            <div style="padding: 0 16px;">
                <button class="btn btn-primary" style="width: 100%; margin-bottom: 12px;" id="chatWithAiBtn">
                    💬 Chat with AI Assistant
                </button>
                <button class="btn btn-secondary" style="width: 100%;" id="checkAgainBtn">
                    🔄 Check Again
                </button>
            </div>
        `;
        
        this.taskContent.innerHTML = html;
        
        document.getElementById('chatWithAiBtn').addEventListener('click', () => {
            this.switchView('chat');
        });
        
        document.getElementById('checkAgainBtn').addEventListener('click', () => {
            this.loadTask();
        });
    }
    
    displayError() {
        const html = `
            <div class="no-task">
                <div class="no-task-icon">⚠️</div>
                <p><strong>Connection Error</strong></p>
                <p style="margin-top: 8px; font-size: 13px;">
                    Unable to connect to ONBOARD.AI backend. Make sure the server is running.
                </p>
            </div>
            <div style="padding: 0 16px;">
                <button class="btn btn-primary" style="width: 100%;" id="retryBtn">
                    🔄 Retry Connection
                </button>
            </div>
        `;
        
        this.taskContent.innerHTML = html;
        
        document.getElementById('retryBtn').addEventListener('click', () => {
            this.loadTask();
        });
    }
    
    async startGuidance(task) {
        try {
            // FIXED: Ensure content script is injected
            await chrome.scripting.executeScript({
                target: { tabId: this.currentContext.tabId },
                files: ['content.js']
            }).catch(() => {
                console.log('Content script already injected');
            });
            
            // FIXED: Wait a bit for script to initialize
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Send message to start guidance
            chrome.tabs.sendMessage(this.currentContext.tabId, { 
                action: 'start_guidance',
                task_id: task.id
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to send message:', chrome.runtime.lastError);
                    alert('Please refresh the page and try again.');
                } else {
                    // Close popup only if message was sent successfully
                    window.close();
                }
            });
            
        } catch (error) {
            console.error('Failed to start guidance:', error);
            alert('Please refresh the page and try again.');
        }
    }
    
    async handleSend() {
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        this.addMessage(message, 'user');
        this.chatInput.value = '';
        this.sendBtn.disabled = true;
        
        this.showTyping();
        
        try {
            const response = await fetch(`${API_BASE}/api/chat/parse-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: EMPLOYEE_ID,
                    message: message,
                    context: this.currentContext
                })
            });
            
            const data = await response.json();
            this.hideTyping();
            
            if (data.understood) {
                this.showTaskMatch(data.task, data.matches);
            } else {
                this.addMessage(data.message, 'ai');
                if (data.suggestions) {
                    this.showSuggestions(data.suggestions);
                }
            }
        } catch (error) {
            this.hideTyping();
            this.addMessage('Sorry, I encountered an error. Please make sure the backend is running and try again.', 'ai');
            console.error('Chat error:', error);
        }
        
        this.sendBtn.disabled = false;
    }
    
    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${sender}`;
        messageDiv.textContent = text;
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    hideTyping() {
        const typing = document.getElementById('typing-indicator');
        if (typing) typing.remove();
    }
    
    showTaskMatch(task, alternatives) {
        this.pendingTask = task;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-ai';
        
        const confidenceBadge = this.getConfidenceBadge(task.confidence);
        
        messageDiv.innerHTML = `
            Perfect! I found this task:
            <div class="task-match-card">
                <div class="task-match-header">
                    <div class="task-match-icon">✨</div>
                    <div>
                        <div class="task-match-title">${task.title}</div>
                    </div>
                </div>
                <div class="task-match-meta">
                    Platform: ${this.capitalize(task.platform)}
                    ${confidenceBadge}
                </div>
                <button class="btn btn-primary" style="width: 100%;" id="start-task-btn">
                    🚀 Start Guidance Now
                </button>
            </div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        
        document.getElementById('start-task-btn').addEventListener('click', () => {
            this.startTaskFromChat(task);
        });
        
        if (alternatives && alternatives.length > 1) {
            const altDiv = document.createElement('div');
            altDiv.className = 'message message-ai';
            altDiv.innerHTML = 'Or did you mean:';
            this.chatMessages.appendChild(altDiv);
            
            const suggestions = alternatives.slice(1).map(alt => alt.title);
            this.showSuggestions(suggestions);
        }
    }
    
    showSuggestions(suggestions) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'suggestions';
        
        suggestions.forEach(suggestion => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            btn.textContent = suggestion;
            btn.addEventListener('click', () => {
                this.chatInput.value = suggestion;
                this.handleSend();
            });
            suggestionsDiv.appendChild(btn);
        });
        
        this.chatMessages.appendChild(suggestionsDiv);
        this.scrollToBottom();
    }
    
    async startTaskFromChat(task) {
        try {
            this.addMessage('Creating your task...', 'ai');
            
            const response = await fetch(`${API_BASE}/api/chat/create-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: EMPLOYEE_ID,
                    task: task
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.addMessage('✅ Task created! Injecting guidance system...', 'ai');
                
                // FIXED: Proper script injection and message sending
                try {
                    // Inject content script
                    await chrome.scripting.executeScript({
                        target: { tabId: this.currentContext.tabId },
                        files: ['content.js']
                    }).catch(() => {
                        console.log('Content script already present');
                    });
                    
                    // Wait for initialization
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Send start guidance message with retry
                    let retries = 3;
                    let success = false;
                    
                    while (retries > 0 && !success) {
                        try {
                            await new Promise((resolve, reject) => {
                                chrome.tabs.sendMessage(
                                    this.currentContext.tabId, 
                                    { 
                                        action: 'start_guidance',
                                        task_id: data.task_id
                                    },
                                    (response) => {
                                        if (chrome.runtime.lastError) {
                                            reject(chrome.runtime.lastError);
                                        } else {
                                            resolve(response);
                                        }
                                    }
                                );
                            });
                            success = true;
                        } catch (err) {
                            retries--;
                            if (retries > 0) {
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                    }
                    
                    if (success) {
                        this.addMessage('🎉 Guidance is now active! Check the page.', 'ai');
                        
                        // Update task view
                        setTimeout(() => {
                            this.loadTask();
                        }, 1000);
                        
                        // Close popup
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    } else {
                        throw new Error('Failed to activate guidance after retries');
                    }
                    
                } catch (scriptError) {
                    console.error('Script injection error:', scriptError);
                    this.addMessage('⚠️ Please refresh the page and click the extension icon to start guidance.', 'ai');
                }
            }
        } catch (error) {
            this.addMessage('Failed to create task. Please make sure the backend is running.', 'ai');
            console.error('Task creation error:', error);
        }
    }
    
    getConfidenceBadge(confidence) {
        let badgeClass = 'confidence-low';
        let label = 'Low match';
        
        if (confidence >= 0.7) {
            badgeClass = 'confidence-high';
            label = 'Great match!';
        } else if (confidence >= 0.4) {
            badgeClass = 'confidence-medium';
            label = 'Good match';
        }
        
        return `<span class="confidence-badge ${badgeClass}">${label}</span>`;
    }
    
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OnboardPopup();
});