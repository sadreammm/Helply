// Chatbot.js - ENHANCED WITH TASK LIST

window.__ONBOARD = window.__ONBOARD || { API_BASE: 'http://localhost:8000', EMPLOYEE_ID: 'emp_001' };
const API_BASE = window.__ONBOARD.API_BASE;
const EMPLOYEE_ID = window.__ONBOARD.EMPLOYEE_ID;

class OnboardPopup {
    constructor() {
        this.currentView = 'task';
        this.currentTask = null;
        this.allTasks = [];
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
        await this.loadAllTasks();
        
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
    
    async loadAllTasks() {
        try {
            // Fetch all tasks for the employee
            const response = await fetch(`${API_BASE}/api/employee/task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: EMPLOYEE_ID,
                    current_url: this.currentContext.url
                })
            });
            
            const data = await response.json();
            
            // Get all tasks from CRM
            const tasksResponse = await fetch(`${API_BASE}/api/employees/${EMPLOYEE_ID}/tasks`);
            const allTasks = await tasksResponse.json();
            
            this.allTasks = Array.isArray(allTasks) ? allTasks : [];
            
            if (data.has_active_task) {
                this.currentTask = data.task;
            }
            
            this.displayTaskList();
            
        } catch (error) {
            console.error('Failed to load tasks:', error);
            this.displayError();
        }
    }
    
    displayTaskList() {
        if (this.allTasks.length === 0) {
            this.displayNoTask();
            return;
        }
        
        // Sort tasks: in_progress first, then by priority
        const sortedTasks = [...this.allTasks].sort((a, b) => {
            if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
            if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
            return a.priority - b.priority;
        });
        
        let html = '<div class="section-title">Your Tasks</div>';
        
        sortedTasks.forEach(task => {
            const progress = (task.steps_completed / task.total_steps) * 100;
            const isActive = task.id === this.currentTask?.id;
            
            html += `
                <div class="task-card ${isActive ? 'active-task' : ''}" data-task-id="${task.id}">
                    <div class="task-header">
                        <div class="task-icon">${this.getTaskIcon(task.platform)}</div>
                        <div class="task-info">
                            <div class="task-title">${task.title}</div>
                            <div class="task-progress-text">${task.steps_completed} / ${task.total_steps} steps</div>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="task-meta">
                        <span class="status-badge status-${task.status === 'completed' ? 'complete' : 'active'}">
                            ${task.status === 'completed' ? '✓ Complete' : task.status === 'in_progress' ? '⏱ Active' : '📋 Pending'}
                        </span>
                        <span class="task-platform">${this.capitalize(task.platform)}</span>
                    </div>
                    <div class="task-actions">
                        <button class="btn btn-primary start-task-btn" data-task-id="${task.id}">
                            ${task.steps_completed > 0 ? '▶ Continue' : '🚀 Start'}
                        </button>
                        <button class="btn btn-secondary delete-task-btn" data-task-id="${task.id}">🗑</button>
                    </div>
                </div>
            `;
        });
        
        html += `
            <div style="margin-top: 20px;">
                <div class="section-title">Need something else?</div>
                <button class="btn btn-primary" style="width: 100%;" id="createNewTaskBtn">
                    ➕ Create New Task
                </button>
            </div>
        `;
        
        this.taskContent.innerHTML = html;
        
        // Add event listeners
        document.querySelectorAll('.start-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taskId = e.target.dataset.taskId;
                const task = this.allTasks.find(t => t.id === taskId);
                if (task) this.startGuidance(task);
            });
        });
        
        document.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const taskId = e.target.dataset.taskId;
                if (confirm('Delete this task?')) {
                    await this.deleteTask(taskId);
                }
            });
        });
        
        document.getElementById('createNewTaskBtn')?.addEventListener('click', () => {
            this.switchView('chat');
        });
    }
    
    getTaskIcon(platform) {
        const icons = {
            'github': '🐙',
            'github.com': '🐙',
        };
        return icons[platform.toLowerCase()] || '📋';
    }
    
    async deleteTask(taskId) {
        try {
            await fetch(`${API_BASE}/api/tasks/${taskId}?employee_id=${EMPLOYEE_ID}`, {
                method: 'DELETE'
            });
            await this.loadAllTasks();
        } catch (error) {
            console.error('Failed to delete task:', error);
            alert('Failed to delete task');
        }
    }
    
    displayNoTask() {
        const html = `
            <div class="no-task">
                <div class="no-task-icon">✅</div>
                <p><strong>No active tasks</strong></p>
                <p style="margin-top: 8px; font-size: 13px; line-height: 1.5;">
                    You're all caught up! Create a new task using the AI assistant.
                </p>
            </div>
            <div style="padding: 0 16px;">
                <button class="btn btn-primary" style="width: 100%; margin-bottom: 12px;" id="chatWithAiBtn">
                    💬 Chat with AI Assistant
                </button>
                <button class="btn btn-secondary" style="width: 100%;" id="checkAgainBtn">
                    🔄 Refresh Tasks
                </button>
            </div>
        `;
        
        this.taskContent.innerHTML = html;
        
        document.getElementById('chatWithAiBtn').addEventListener('click', () => {
            this.switchView('chat');
        });
        
        document.getElementById('checkAgainBtn').addEventListener('click', () => {
            this.loadAllTasks();
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
            this.loadAllTasks();
        });
    }
    
    async startGuidance(task) {
        try {
            // Ensure content script is injected
            await chrome.scripting.executeScript({
                target: { tabId: this.currentContext.tabId },
                files: ['content.js']
            }).catch(() => {
                console.log('Content script already injected');
            });
            
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
                this.addMessage('✅ Task created successfully!', 'ai');
                
                // Reload task list
                await this.loadAllTasks();
                
                // Switch to task view
                setTimeout(() => {
                    this.switchView('task');
                    this.addMessage('Check the Tasks tab to start guidance!', 'ai');
                }, 1000);
            }
        } catch (error) {
            this.addMessage('Failed to create task. Please make sure the backend is running.', 'ai');
            console.error('Task creation error:', error);
        }
    }
    
    getConfidenceBadge(confidence) {
        let badgeClass = 'confidence-low';
        let label = 'Low match';
        
        if (confidence >= 0.6) {
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
