if (window.__ONBOARD_LOADED) {
    console.log('[ONBOARD.AI] Content script already loaded, skipping');
} else {
    window.__ONBOARD_LOADED = true;

    window.__ONBOARD = window.__ONBOARD || {
        API_BASE: 'http://localhost:8000',
        EMPLOYEE_ID: 'emp_001'
    };

class OnboardOverlay {
    constructor() {
        this.currentTask = null;
        this.overlayVisible = false;
        this.idleTimeout = null;
        this.helpShown = false;
        this.currentGuidance = null;
        this.suppressUntil = 0;
        this.lastUrl = location.href;
        this.submitBound = false;
        this.urlCheckInterval = null;
        this.init();
    }

    async init() {
        const hasTask = await this.checkForTask();
        
        if (hasTask) {
            this.injectStyles();
            this.setupIdleDetection();
            setTimeout(() => this.showHelpPrompt(), 3000);
        }
    }

    async safeProxyFetch(url, options) {
        try {
            const proxy = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'proxy_fetch',
                    url: url,
                    fetchOptions: options
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            if (!proxy || proxy.error) {
                throw new Error(proxy?.error || 'Proxy fetch failed');
            }
            
            return proxy.body;
        } catch (error) {
            if (error.message.includes('Extension context invalidated') || 
                error.message.includes('message port closed')) {
                this.showExtensionReloadPrompt();
                throw new Error('Extension needs reload');
            }
            throw error;
        }
    }

    showExtensionReloadPrompt() {
        document.getElementById('onboard-reload-prompt')?.remove();
        
        const prompt = document.createElement('div');
        prompt.id = 'onboard-reload-prompt';
        prompt.className = 'onboard-help-prompt';
        prompt.style.zIndex = '10000000';
        prompt.innerHTML = `
            <div class="onboard-help-header">
                <div class="onboard-help-icon">🔄</div>
                <div class="onboard-help-title">Extension Updated</div>
            </div>
            <div class="onboard-help-message">
                The ONBOARD.AI extension was updated. Please reload this page to continue.
            </div>
            <div class="onboard-help-buttons">
                <button class="onboard-btn onboard-btn-primary" id="onboard-reload-page">
                    Reload Page
                </button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        document.getElementById('onboard-reload-page').addEventListener('click', () => {
            window.location.reload();
        });
    }

    async checkForTask() {
        try {
            const data = await this.safeProxyFetch(
                `${window.__ONBOARD.API_BASE}/api/employee/task`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        employee_id: window.__ONBOARD.EMPLOYEE_ID, 
                        current_url: window.location.href 
                    })
                }
            );
            
            if (data.has_active_task) {
                this.currentTask = data.task;
                return true;
            }
            return false;
        } catch (error) {
            if (error.message !== 'Extension needs reload') {
                console.error('[ONBOARD.AI] Failed to fetch task:', error);
            }
            return false;
        }
    }

    injectStyles() {
        if (document.getElementById('onboard-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'onboard-styles';
        style.textContent = `
            .onboard-overlay {
                position: fixed;
                z-index: 999999;
                pointer-events: none;
            }
            
            .onboard-highlight {
                position: absolute;
                border: 3px solid #8b5cf6;
                border-radius: 8px;
                box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.2), 0 0 20px rgba(139, 92, 246, 0.4);
                animation: onboard-pulse 2s infinite;
                pointer-events: none;
                z-index: 999998;
            }
            
            @keyframes onboard-pulse {
                0%, 100% { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.2), 0 0 20px rgba(139, 92, 246, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(139, 92, 246, 0.3), 0 0 30px rgba(139, 92, 246, 0.6); }
            }
            
            .onboard-tooltip {
                position: absolute;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 20px;
                border-radius: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 14px;
                line-height: 1.5;
                max-width: 320px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                pointer-events: auto;
                z-index: 999999;
                animation: onboard-fadein 0.3s ease-out;
            }
            
            @keyframes onboard-fadein {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .onboard-tooltip-arrow {
                position: absolute;
                width: 0;
                height: 0;
                border-style: solid;
            }
            
            .onboard-tooltip-arrow.bottom {
                top: -8px;
                left: 50%;
                transform: translateX(-50%);
                border-width: 0 8px 8px 8px;
                border-color: transparent transparent #667eea transparent;
            }
            
            .onboard-help-prompt {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: white;
                border-radius: 16px;
                padding: 24px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                max-width: 360px;
                z-index: 999999;
                animation: onboard-slidein 0.4s ease-out;
                pointer-events: auto;
            }
            
            @keyframes onboard-slidein {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            .onboard-help-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
            }
            
            .onboard-help-icon {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
            }
            
            .onboard-help-title {
                font-size: 18px;
                font-weight: 600;
                color: #1f2937;
            }
            
            .onboard-help-message {
                color: #6b7280;
                margin-bottom: 16px;
                line-height: 1.5;
            }
            
            .onboard-help-buttons {
                display: flex;
                gap: 12px;
            }
            
            .onboard-btn {
                flex: 1;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 14px;
            }
            
            .onboard-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .onboard-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .onboard-btn-secondary {
                background: #f3f4f6;
                color: #6b7280;
            }
            
            .onboard-btn-secondary:hover {
                background: #e5e7eb;
            }
            
            .onboard-progress-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: rgba(139, 92, 246, 0.2);
                z-index: 999999;
            }
            
            .onboard-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                transition: width 0.3s ease;
            }
            
            .onboard-text-guidance {
                position: fixed;
                bottom: 80px;
                right: 24px;
                z-index: 999999;
                animation: onboard-slidein 0.3s ease-out;
            }
            
            .onboard-mini-indicator {
                position: fixed;
                bottom: 24px;
                left: 24px;
                background: white;
                padding: 12px 16px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 999999;
                pointer-events: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            
            .onboard-mini-icon {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 14px;
            }
            
            .onboard-mini-text {
                font-size: 13px;
                color: #1f2937;
                font-weight: 500;
            }
            
            .onboard-mini-close {
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                width: 20px;
                height: 20px;
                margin-left: 8px;
            }
            
            .onboard-mini-close:hover {
                color: #6b7280;
            }
        `;
        document.head.appendChild(style);
    }

    setupIdleDetection() {
        const resetTimer = () => {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = setTimeout(() => {
                if (!this.helpShown && !this.overlayVisible) {
                    this.showHelpPrompt();
                }
            }, 30000);
        };

        ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetTimer);
        });

        resetTimer();
    }

    showHelpPrompt() {
        if (this.helpShown) return;
        
        this.helpShown = true;
        
        const prompt = document.createElement('div');
        prompt.className = 'onboard-help-prompt';
        prompt.innerHTML = `
            <div class="onboard-help-header">
                <div class="onboard-help-icon">✨</div>
                <div class="onboard-help-title">Need Help?</div>
            </div>
            <div class="onboard-help-message">
                You have an active task: <strong>${this.currentTask.title}</strong>
                <br><br>
                Would you like step-by-step guidance?
            </div>
            <div class="onboard-help-buttons">
                <button class="onboard-btn onboard-btn-primary" id="onboard-help-yes">
                    Yes, Guide Me
                </button>
                <button class="onboard-btn onboard-btn-secondary" id="onboard-help-no">
                    Not Now
                </button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        document.getElementById('onboard-help-yes').addEventListener('click', () => {
            prompt.remove();
            this.startGuidance();
        });
        
        document.getElementById('onboard-help-no').addEventListener('click', () => {
            prompt.remove();
            this.helpShown = false;
        });
    }

    async startGuidance() {
        console.log('[ONBOARD.AI] startGuidance called, currentTask:', this.currentTask);
        
        if (!this.currentTask) {
            console.error('[ONBOARD.AI] No currentTask set! Cannot start guidance.');
            alert('No task selected. Please select a task first.');
            return;
        }
        
        this.overlayVisible = true;
        
        this.showMiniIndicator();
        this.showProgressBar();
        await this.updateGuidance();
        this.startUrlMonitoring();
    }

    startUrlMonitoring() {
        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
        }
        
        this.urlCheckInterval = setInterval(() => {
            const currentUrl = location.href;
            if (currentUrl !== this.lastUrl) {
                console.log('[ONBOARD.AI] URL changed:', this.lastUrl, '->', currentUrl);
                this.lastUrl = currentUrl;
                this.onUrlChange();
            }
        }, 500);
    }

    async onUrlChange() {
        this.clearOverlays();
        document.getElementById('onboard-text-guidance')?.remove();
        await new Promise(resolve => setTimeout(resolve, 800));
        await this.updateGuidance();
    }

    showMiniIndicator() {
        document.getElementById('onboard-mini-indicator')?.remove();
        
        const indicator = document.createElement('div');
        indicator.className = 'onboard-mini-indicator';
        indicator.id = 'onboard-mini-indicator';
        
        indicator.innerHTML = `
            <div class="onboard-mini-icon">✨</div>
            <div class="onboard-mini-text">${this.currentTask.title}</div>
            <button class="onboard-mini-close" title="Close" id="onboard-mini-close">×</button>
        `;
        
        document.body.appendChild(indicator);
        
        document.getElementById('onboard-mini-close').addEventListener('click', () => {
            this.stopGuidance();
        });
    }

    showProgressBar() {
        const progress = (this.currentTask.steps_completed / this.currentTask.total_steps) * 100;
        
        const bar = document.createElement('div');
        bar.className = 'onboard-progress-bar';
        bar.id = 'onboard-progress-bar';
        bar.innerHTML = `<div class="onboard-progress-fill" style="width: ${progress}%"></div>`;
        
        document.body.appendChild(bar);
    }

    async updateGuidance() {
        try {
            if (Date.now() < this.suppressUntil) {
                console.log('[ONBOARD.AI] Guidance suppressed');
                return;
            }
            
            const context = {
                url: window.location.href,
                page_title: document.title,
                visible_text: document.body.innerText.substring(0, 1000),
                dom_elements: this.getKeyDOMElements(),
                employee_id: window.__ONBOARD.EMPLOYEE_ID,
                task_id: this.currentTask.id,
                current_step: this.currentTask.steps_completed
            };
            
            console.log('[ONBOARD.AI] Fetching guidance for step:', this.currentTask.steps_completed);
            
            this.currentGuidance = await this.safeProxyFetch(
                `${window.__ONBOARD.API_BASE}/api/guidance`,
                { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(context) 
                }
            );
            
            console.log('[ONBOARD.AI] Guidance received:', this.currentGuidance);
            
            if (this.currentGuidance?.step_number) {
                const newStep = this.currentGuidance.step_number - 1;
                if (Number.isFinite(newStep) && newStep !== this.currentTask.steps_completed) {
                    console.log(`[ONBOARD.AI] Auto-advancing from step ${this.currentTask.steps_completed} to ${newStep}`);
                    this.currentTask.steps_completed = newStep;
                }
            }
            
            this.clearOverlays();
            this.renderGuidance();
            
            if (this.currentGuidance.task_complete) {
                this.showCompletionMessage();
                return;
            }
            
            this.updateProgressBar();
            
        } catch (error) {
            if (error.message !== 'Extension needs reload') {
                console.error('[ONBOARD.AI] Failed to fetch guidance:', error);
            }
        }
    }

    updateProgressBar() {
        const barFill = document.querySelector('.onboard-progress-fill');
        if (barFill) {
            const progress = Math.min((this.currentTask.steps_completed / this.currentTask.total_steps) * 100, 100);
            barFill.style.width = `${progress}%`;
        }
    }

    getKeyDOMElements() {
        const elements = [];
        document.querySelectorAll('button, a, input, select, summary, [role="button"]').forEach(el => {
            if (el.offsetParent !== null) {
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const classes = el.className ? `.${el.className.split(' ')[0]}` : '';
                const text = el.textContent ? el.textContent.trim().substring(0, 30) : '';
                elements.push(`${tag}${id}${classes}${text ? `[${text}]` : ''}`);
            }
        });
        return elements.slice(0, 50);
    }

    findElement(action) {
        let selector = action.target_selector;
        let textSearchPattern = null;
        
        if (selector.includes(':has-text(') || selector.includes(':contains(')) {
            const match = selector.match(/:(?:has-text|contains)\(['"]([^'"]+)['"]\)/);
            if (match) {
                textSearchPattern = match[1];
                selector = selector.split(':')[0] || '*';
            }
        }
        
        try {
            let element = document.querySelector(selector);
            if (textSearchPattern && element && !element.textContent.includes(textSearchPattern)) {
                element = null;
            }
            if (element && element.offsetParent !== null) {
                return element;
            }
        } catch (e) {
            console.warn(`[ONBOARD.AI] Invalid selector: ${selector}`, e);
        }
        
        if (action.alternatives) {
            for (const altSelector of action.alternatives) {
                try {
                    const element = document.querySelector(altSelector);
                    if (element && element.offsetParent !== null) {
                        return element;
                    }
                } catch (e) {}
            }
        }
        
        const searchText = textSearchPattern || (action.message && action.action_type === 'click' ? 
            (action.message.toLowerCase().match(/['"]([^'"]+)['"]/g) || [])[0]?.replace(/['"]/g, '') : null);
        
        if (searchText) {
            const searchLower = searchText.toLowerCase();
            if (action.action_type === 'click' || action.action_type === 'submit') {
                const clickable = document.querySelectorAll('button, a, [role="button"], summary, input[type="submit"]');
                for (const el of clickable) {
                    if ((el.textContent.toLowerCase().includes(searchLower) || 
                         el.getAttribute('aria-label')?.toLowerCase().includes(searchLower)) && 
                        el.offsetParent !== null) {
                        return el;
                    }
                }
            }
        }
        
        if (window.location.hostname.includes('github.com')) {
            if (action.message.toLowerCase().includes('repository name')) {
                return document.querySelector('input[name="repository[name]"]');
            }
            if (action.message.toLowerCase().includes('description')) {
                return document.querySelector('input[name="repository[description]"]');
            }
            if (action.message.toLowerCase().includes('readme')) {
                return document.querySelector('input[name="repository[auto_init]"]');
            }
            if (action.message.toLowerCase().includes('create') && action.message.toLowerCase().includes('repository')) {
                return document.querySelector('button[type="submit"][data-disable-with]');
            }
        }
        
        return null;
    }

    renderGuidance() {
        if (!this.currentGuidance || !this.currentGuidance.actions) {
            this.showGenericGuidanceMessage();
            return;
        }
        
        const hasGenericSelectors = this.currentGuidance.actions.some(action => 
            !action.target_selector || action.target_selector === 'body' || action.target_selector === 'html'
        );
        
        if (hasGenericSelectors) {
            this.showTextGuidance();
            return;
        }
        
        this.currentGuidance.actions.forEach((action, index) => {
            setTimeout(() => {
                const element = this.findElement(action);
                if (element) {
                    this.createOverlayForElement(element, action);
                }
            }, index * 300);
        });
    }
    
    showTextGuidance() {
        document.getElementById('onboard-text-guidance')?.remove();
        
        const guidanceBox = document.createElement('div');
        guidanceBox.className = 'onboard-text-guidance';
        guidanceBox.id = 'onboard-text-guidance';
        guidanceBox.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 400px;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 12px; color: #1f2937;">
                    📋 ${this.currentGuidance.step_description || 'Next Step'}
                </div>
                <div style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                    ${this.currentGuidance.guidance_text || this.currentGuidance.actions.map(a => a.message).join('<br><br>')}
                </div>
                <button class="onboard-btn onboard-btn-secondary" id="text-guidance-close" style="width: 100%;">
                    Got it
                </button>
            </div>
        `;
        
        document.body.appendChild(guidanceBox);
        document.getElementById('text-guidance-close').addEventListener('click', () => guidanceBox.remove());
    }
    
    showGenericGuidanceMessage() {
        const message = document.createElement('div');
        message.className = 'onboard-help-prompt';
        message.innerHTML = `
            <div class="onboard-help-header">
                <div class="onboard-help-icon">💡</div>
                <div class="onboard-help-title">Continue Your Task</div>
            </div>
            <div class="onboard-help-message">
                I don't have specific guidance for this page yet, but you're on the right track!
                <br><br>
                <strong>Current task:</strong> ${this.currentTask.title}
            </div>
            <div class="onboard-help-buttons">
                <button class="onboard-btn onboard-btn-primary" id="generic-ok">Continue</button>
            </div>
        `;
        
        document.body.appendChild(message);
        document.getElementById('generic-ok').addEventListener('click', () => message.remove());
    }

    createOverlayForElement(element, action) {
        const rect = element.getBoundingClientRect();
        
        if (action.action_type === 'highlight' || action.action_type === 'click') {
            const highlight = document.createElement('div');
            highlight.className = 'onboard-highlight onboard-overlay';
            highlight.style.left = `${rect.left + window.scrollX - 4}px`;
            highlight.style.top = `${rect.top + window.scrollY - 4}px`;
            highlight.style.width = `${rect.width + 8}px`;
            highlight.style.height = `${rect.height + 8}px`;
            document.body.appendChild(highlight);
        }
        
        const tooltip = document.createElement('div');
        tooltip.className = 'onboard-tooltip onboard-overlay';
        tooltip.innerHTML = `
            <div class="onboard-tooltip-arrow ${action.position || 'bottom'}"></div>
            ${action.message}
        `;
        
        document.body.appendChild(tooltip);
        
        const tooltipRect = tooltip.getBoundingClientRect();
        let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.bottom + window.scrollY + 12;
        
        tooltip.style.left = `${Math.max(10, left)}px`;
        tooltip.style.top = `${Math.max(10, top)}px`;
    }

    clearOverlays() {
        document.querySelectorAll('.onboard-overlay').forEach(el => el.remove());
    }

    showCompletionMessage() {
        this.clearOverlays();
        
        const completion = document.createElement('div');
        completion.className = 'onboard-help-prompt';
        completion.innerHTML = `
            <div class="onboard-help-header">
                <div class="onboard-help-icon">🎉</div>
                <div class="onboard-help-title">Task Complete!</div>
            </div>
            <div class="onboard-help-message">
                Congratulations! You've successfully completed:<br>
                <strong>${this.currentTask.title}</strong>
            </div>
            <div class="onboard-help-buttons">
                <button class="onboard-btn onboard-btn-primary" id="onboard-finish">Awesome!</button>
            </div>
        `;
        
        document.body.appendChild(completion);
        document.getElementById('onboard-finish').addEventListener('click', () => {
            completion.remove();
            this.stopGuidance();
        });
        
        this.updateTaskProgress(this.currentTask.total_steps);
    }

    async updateTaskProgress(step) {
        try {
            await this.safeProxyFetch(
                `${window.__ONBOARD.API_BASE}/api/task/progress`,
                { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ 
                        employee_id: window.__ONBOARD.EMPLOYEE_ID, 
                        task_id: this.currentTask.id, 
                        step_completed: step 
                    }) 
                }
            );
        } catch (error) {
            if (error.message !== 'Extension needs reload') {
                console.error('[ONBOARD.AI] Failed to update progress:', error);
            }
        }
    }

    stopGuidance() {
        this.overlayVisible = false;
        
        if (this.urlCheckInterval) {
            clearInterval(this.urlCheckInterval);
            this.urlCheckInterval = null;
        }
        
        this.clearOverlays();
        document.getElementById('onboard-mini-indicator')?.remove();
        document.getElementById('onboard-progress-bar')?.remove();
        document.getElementById('onboard-text-guidance')?.remove();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.__onboardOverlay = new OnboardOverlay();
    });
} else {
    window.__onboardOverlay = new OnboardOverlay();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[ONBOARD.AI] Received message:', request);
    
    if (request.action === 'refresh_guidance' && window.__onboardOverlay) {
        window.__onboardOverlay.updateGuidance();
        sendResponse({ success: true });
    }
    
    if (request.action === 'start_guidance') {
        console.log('[ONBOARD.AI] Received start_guidance message, task_id:', request.task_id);
        if (window.__onboardOverlay) {
            (async () => {
                try {
                    if (request.task_id) {
                        console.log('[ONBOARD.AI] Fetching task by id:', request.task_id);
                        try {
                            const res = await fetch(`${window.__ONBOARD.API_BASE}/api/employees/${window.__ONBOARD.EMPLOYEE_ID}/tasks`);
                            if (res.ok) {
                                const tasks = await res.json();
                                console.log('[ONBOARD.AI] Fetched tasks:', tasks.length);
                                const found = tasks.find(t => String(t.id) === String(request.task_id));
                                if (found) {
                                    console.log('[ONBOARD.AI] Setting currentTask to:', found.title, found.type);
                                    window.__onboardOverlay.currentTask = found;
                                } else {
                                    console.warn('[ONBOARD.AI] Task not found in list:', request.task_id);
                                }
                            }
                        } catch (e) {
                            console.warn('[ONBOARD.AI] Could not prefetch tasks before start:', e);
                        }
                    }

                    console.log('[ONBOARD.AI] Starting guidance with task:', window.__onboardOverlay.currentTask);
                    await window.__onboardOverlay.startGuidance();
                    console.log('[ONBOARD.AI] Guidance started successfully');
                    sendResponse({ success: true });
                } catch (err) {
                    console.error('[ONBOARD.AI] Failed to start guidance:', err);
                    sendResponse({ success: false, error: err.message });
                }
            })();
        } else {
            console.error('[ONBOARD.AI] Overlay not initialized');
            sendResponse({ success: false, error: 'Overlay not initialized' });
        }
        return true;
    }
    
    if (request.action === 'check_task') {
        sendResponse({ present: !!window.__onboardOverlay });
    }
    
    return true;
});

} 
