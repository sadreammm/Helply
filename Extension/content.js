// content.js - Enhanced with smart selector finding

// Prevent duplicate injection
if (window.__ONBOARD_LOADED) {
    console.log('[ONBOARD.AI] Content script already loaded, skipping');
} else {
    window.__ONBOARD_LOADED = true;

    // Use a single global namespace so values persist across reloads/injections
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
        this.init();
    }

    async init() {
        const hasTask = await this.checkForTask();
        
        if (hasTask) {
            this.injectStyles();
            this.setupIdleDetection();
            setTimeout(() => this.showHelpPrompt(), 5000);
        }
    }

    async safeProxyFetch(url, options) {
        // Wrapper that handles extension context invalidation
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
            // Check if extension context was invalidated
            if (error.message.includes('Extension context invalidated') || 
                error.message.includes('message port closed')) {
                this.showExtensionReloadPrompt();
                throw new Error('Extension needs reload');
            }
            throw error;
        }
    }

    showExtensionReloadPrompt() {
        // Remove any existing prompt
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
            
            .onboard-tooltip-arrow.top {
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                border-width: 8px 8px 0 8px;
                border-color: #764ba2 transparent transparent transparent;
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
            
            .onboard-task-banner {
                position: fixed;
                top: 16px;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                padding: 12px 24px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 999999;
                pointer-events: auto;
            }
            
            .onboard-task-icon {
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
            }
            
            .onboard-task-text {
                font-size: 14px;
                color: #1f2937;
            }
            
            .onboard-close-btn {
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                font-size: 20px;
                padding: 0;
                width: 24px;
                height: 24px;
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
        this.overlayVisible = true;
        
        this.showTaskBanner();
        this.showProgressBar();
        await this.updateGuidance();
        this.observePageChanges();
        this.attachCreateRepoSubmitListener();
    }

    showTaskBanner() {
        const banner = document.createElement('div');
        banner.className = 'onboard-task-banner';
        banner.id = 'onboard-task-banner';
        
        const currentStep = Math.min(this.currentTask.steps_completed + 1, this.currentTask.total_steps);
        
        banner.innerHTML = `
            <div class="onboard-task-icon">${currentStep}</div>
            <div class="onboard-task-text">
                <strong>${this.currentTask.title}</strong> - Step ${currentStep} of ${this.currentTask.total_steps}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="onboard-close-btn" title="Refresh" id="onboard-refresh">🔄</button>
              <button class="onboard-close-btn" title="Close" id="onboard-close">×</button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        document.getElementById('onboard-close').addEventListener('click', () => {
            this.stopGuidance();
        });

        document.getElementById('onboard-refresh').addEventListener('click', async () => {
            await this.updateGuidance();
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
            if (Date.now() < this.suppressUntil) return;
            
            const context = {
                url: window.location.href,
                page_title: document.title,
                visible_text: document.body.innerText.substring(0, 1000),
                dom_elements: this.getKeyDOMElements(),
                employee_id: window.__ONBOARD.EMPLOYEE_ID,
                task_id: this.currentTask.id
            };
            
            this.currentGuidance = await this.safeProxyFetch(
                `${window.__ONBOARD.API_BASE}/api/guidance`,
                { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(context) 
                }
            );
            
            // Log for debugging
            console.log('[ONBOARD.AI] Guidance received:', this.currentGuidance);
            
            if (this.currentGuidance?.step_number) {
                const newStep = this.currentGuidance.step_number - 1;
                if (Number.isFinite(newStep) && newStep !== this.currentTask.steps_completed) {
                    this.currentTask.steps_completed = newStep;
                }
            }
            
            this.clearOverlays();
            this.renderGuidance();
            
            if (this.currentGuidance.task_complete) {
                this.showCompletionMessage();
            }
            
            const banner = document.getElementById('onboard-task-banner');
            if (banner) {
                const currentStep = Math.min(this.currentTask.steps_completed + 1, this.currentTask.total_steps);
                banner.querySelector('.onboard-task-icon').textContent = String(currentStep);
                banner.querySelector('.onboard-task-text').innerHTML = `
                    <strong>${this.currentTask.title}</strong> - Step ${currentStep} of ${this.currentTask.total_steps}
                `;
            }
            
            const barFill = document.querySelector('.onboard-progress-fill');
            if (barFill) {
                const progress = Math.min((this.currentTask.steps_completed / this.currentTask.total_steps) * 100, 100);
                barFill.style.width = `${progress}%`;
            }
            
        } catch (error) {
            if (error.message !== 'Extension needs reload') {
                console.error('[ONBOARD.AI] Failed to fetch guidance:', error);
            }
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

    /**
     * Smart selector finding with multiple fallback strategies
     */
    findElement(action) {
        let selector = action.target_selector;
        
        // Handle Playwright-style pseudo-selectors that aren't valid CSS
        // Convert :has-text('text') to a text search
        // Convert :contains('text') to a text search
        let textSearchPattern = null;
        
        if (selector.includes(':has-text(') || selector.includes(':contains(')) {
            const match = selector.match(/:(?:has-text|contains)\(['"]([^'"]+)['"]\)/);
            if (match) {
                textSearchPattern = match[1];
                // Extract the base selector (before the pseudo-selector)
                selector = selector.split(':')[0] || '*';
                console.log(`[ONBOARD.AI] Converted pseudo-selector to text search: "${textSearchPattern}" in ${selector}`);
            }
        }
        
        // Strategy 1: Try the primary selector (if it's valid CSS)
        try {
            let element = document.querySelector(selector);
            
            // If we have a text search pattern, filter by text content
            if (textSearchPattern && element) {
                if (!element.textContent.includes(textSearchPattern)) {
                    element = null;
                }
            }
            
            if (element && element.offsetParent !== null) {
                console.log(`[ONBOARD.AI] Found element with primary selector: ${action.target_selector}`);
                return element;
            }
        } catch (e) {
            console.warn(`[ONBOARD.AI] Invalid selector: ${selector}`, e);
        }
        
        // Strategy 2: Try alternatives
        if (action.alternatives && action.alternatives.length > 0) {
            for (const altSelector of action.alternatives) {
                element = document.querySelector(altSelector);
                if (element && element.offsetParent !== null) {
                    console.log(`[ONBOARD.AI] Found element with alternative: ${altSelector}`);
                    return element;
                }
            }
        }
        
        // Strategy 3: Try to find by text content (use textSearchPattern or extract from message)
        const searchText = textSearchPattern || (action.message && action.action_type === 'click' ? 
            (action.message.toLowerCase().match(/['"]([^'"]+)['"]/g) || [])[0]?.replace(/['"]/g, '') : null);
        
        if (searchText) {
            // Try to find the element with matching text
            const searchLower = searchText.toLowerCase();
            
            // For clickable elements
            if (action.action_type === 'click' || action.action_type === 'submit') {
                const clickable = document.querySelectorAll('button, a, [role="button"], summary, input[type="submit"], [type="button"]');
                for (const el of clickable) {
                    if (el.textContent.toLowerCase().includes(searchLower) && el.offsetParent !== null) {
                        console.log(`[ONBOARD.AI] Found element by text: ${searchText}`);
                        return el;
                    }
                    // Also check aria-label
                    const ariaLabel = el.getAttribute('aria-label');
                    if (ariaLabel && ariaLabel.toLowerCase().includes(searchLower) && el.offsetParent !== null) {
                        console.log(`[ONBOARD.AI] Found element by aria-label: ${searchText}`);
                        return el;
                    }
                }
            }
            
            // For labels (like "Add a README file")
            if (selector.includes('label')) {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.toLowerCase().includes(searchLower) && label.offsetParent !== null) {
                        console.log(`[ONBOARD.AI] Found label by text: ${searchText}`);
                        return label;
                    }
                }
            }
        }
        
        // Strategy 4: For GitHub specific - try common patterns
        if (window.location.hostname.includes('github.com')) {
            // Creating repository button
            if (action.message.toLowerCase().includes('create') && action.message.toLowerCase().includes('repository')) {
                const createBtn = document.querySelector('button[type="submit"][data-disable-with]') ||
                                 document.querySelector('button.btn-primary[type="submit"]') ||
                                 document.querySelector('form button[type="submit"]:last-of-type');
                if (createBtn && createBtn.offsetParent !== null) {
                    console.log('[ONBOARD.AI] Found by GitHub pattern: create repository button');
                    return createBtn;
                }
            }
            
            // Plus menu for new repository
            if (action.message.toLowerCase().includes('+') || action.message.toLowerCase().includes('menu')) {
                const plusMenu = document.querySelector('summary[aria-label*="Create"]') ||
                                document.querySelector('[data-target="create-menu.button"]') ||
                                document.querySelector('summary[aria-label*="new"]');
                if (plusMenu && plusMenu.offsetParent !== null) {
                    console.log('[ONBOARD.AI] Found by GitHub pattern: plus menu');
                    return plusMenu;
                }
            }
            
            // Repository name input
            if (action.message.toLowerCase().includes('repository name') || 
                action.message.toLowerCase().includes('give your') ||
                selector.includes('repository')) {
                const nameInput = document.querySelector('input[name="repository[name]"]') ||
                                 document.querySelector('input#repository-name-input') ||
                                 document.querySelector('input#repository_name') ||
                                 document.querySelector('input[aria-label*="Repository name"]') ||
                                 document.querySelector('input[placeholder*="repository"]');
                if (nameInput && nameInput.offsetParent !== null) {
                    console.log('[ONBOARD.AI] Found by GitHub pattern: repository name input');
                    return nameInput;
                }
            }
            
            // Repository description input
            if (action.message.toLowerCase().includes('description')) {
                const descInput = document.querySelector('input[name="repository[description]"]') ||
                                 document.querySelector('textarea[name="repository[description]"]') ||
                                 document.querySelector('input#repository-description-input') ||
                                 document.querySelector('textarea#repository_description');
                if (descInput && descInput.offsetParent !== null) {
                    console.log('[ONBOARD.AI] Found by GitHub pattern: repository description input');
                    return descInput;
                }
            }
            
            // README checkbox
            if (action.message.toLowerCase().includes('readme') || selector.includes('auto_init')) {
                const readmeCheckbox = document.querySelector('input[name="repository[auto_init]"]') ||
                                      document.querySelector('input#repository_auto_init') ||
                                      document.querySelector('input[type="checkbox"][value="1"]');
                if (readmeCheckbox && readmeCheckbox.offsetParent !== null) {
                    console.log('[ONBOARD.AI] Found by GitHub pattern: README checkbox');
                    return readmeCheckbox;
                }
            }
        }
        
        console.warn(`[ONBOARD.AI] Could not find element for selector: ${selector}`);
        return null;
    }

    renderGuidance() {
        if (!this.currentGuidance || !this.currentGuidance.actions) {
            console.warn('[ONBOARD.AI] No guidance actions to render');
            this.showGenericGuidanceMessage();
            return;
        }
        
        console.log(`[ONBOARD.AI] Rendering ${this.currentGuidance.actions.length} guidance actions`);
        
        // Check if guidance is too generic (using body or html selectors)
        const hasGenericSelectors = this.currentGuidance.actions.some(action => 
            action.target_selector === 'body' || 
            action.target_selector === 'html' ||
            action.target_selector === ''
        );
        
        if (hasGenericSelectors) {
            console.warn('[ONBOARD.AI] Generic guidance detected, showing text-based instructions');
            this.showTextGuidance();
            return;
        }
        
        this.currentGuidance.actions.forEach((action, index) => {
            setTimeout(() => {
                const element = this.findElement(action);
                if (element) {
                    this.createOverlayForElement(element, action);
                } else {
                    console.warn(`[ONBOARD.AI] Action ${index + 1}: Element not found`, action);
                }
            }, index * 300);
        });
    }
    
    showTextGuidance() {
        // Show guidance as text instructions when specific selectors aren't available
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
                <div style="display: flex; gap: 8px;">
                    <button class="onboard-btn onboard-btn-secondary" id="text-guidance-close" style="flex: 1;">
                        Got it
                    </button>
                </div>
            </div>
        `;
        
        // Position in bottom-right
        guidanceBox.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 24px;
            z-index: 999999;
            animation: onboard-slidein 0.3s ease-out;
        `;
        
        document.body.appendChild(guidanceBox);
        
        document.getElementById('text-guidance-close').addEventListener('click', () => {
            guidanceBox.remove();
        });
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
                <strong>Current step:</strong> ${this.currentTask.title} - Step ${this.currentTask.steps_completed + 1}
            </div>
            <div class="onboard-help-buttons">
                <button class="onboard-btn onboard-btn-primary" id="generic-ok">
                    Continue
                </button>
            </div>
        `;
        
        document.body.appendChild(message);
        
        document.getElementById('generic-ok').addEventListener('click', () => {
            message.remove();
        });
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
            <div class="onboard-tooltip-arrow ${action.position}"></div>
            ${action.message}
        `;
        
        document.body.appendChild(tooltip);
        
        const tooltipRect = tooltip.getBoundingClientRect();
        let left, top;
        
        if (action.position === 'bottom') {
            left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
            top = rect.bottom + window.scrollY + 12;
        } else if (action.position === 'top') {
            left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
            top = rect.top + window.scrollY - tooltipRect.height - 12;
        } else if (action.position === 'right') {
            left = rect.right + window.scrollX + 12;
            top = rect.top + window.scrollY + (rect.height / 2) - (tooltipRect.height / 2);
        } else {
            left = rect.left + window.scrollX - tooltipRect.width - 12;
            top = rect.top + window.scrollY + (rect.height / 2) - (tooltipRect.height / 2);
        }
        
        tooltip.style.left = `${Math.max(10, left)}px`;
        tooltip.style.top = `${Math.max(10, top)}px`;
    }

    clearOverlays() {
        document.querySelectorAll('.onboard-overlay').forEach(el => el.remove());
    }

    observePageChanges() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => this.updateGuidance(), 500);
                setTimeout(() => this.attachCreateRepoSubmitListener(), 600);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    attachCreateRepoSubmitListener() {
        if (!location.href.includes('github.com/new')) return;
        const submitBtn = document.querySelector("button[type='submit'][data-disable-with]") ||
                         document.querySelector('button.btn-primary[type="submit"]') ||
                         document.querySelector('form button[type="submit"]:last-of-type');
        if (!submitBtn) return;

        if (this._submitBound) return;
        this._submitBound = true;

        const handler = async (e) => {
            try {
                if (this.currentTask.steps_completed >= this.currentTask.total_steps) {
                    return;
                }
                const next = Math.min(this.currentTask.steps_completed + 1, this.currentTask.total_steps);
                await this.updateTaskProgress(next);
                this.currentTask.steps_completed = next;
                this.suppressUntil = Date.now() + 8000;
            } catch (_) { /* ignore */ }
        };
        submitBtn.addEventListener('click', handler, { once: true });
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
                <button class="onboard-btn onboard-btn-primary" id="onboard-finish">
                    Awesome!
                </button>
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
        this.clearOverlays();
        document.getElementById('onboard-task-banner')?.remove();
        document.getElementById('onboard-progress-bar')?.remove();
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.__onboardOverlay = new OnboardOverlay();
    });
} else {
    window.__onboardOverlay = new OnboardOverlay();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refresh_guidance') {
        if (window.__onboardOverlay) {
            window.__onboardOverlay.updateGuidance();
        }
    }
    
    if (request.action === 'start_guidance') {
        if (window.__onboardOverlay) window.__onboardOverlay.startGuidance();
    }

    if (request.action === 'check_task') {
        sendResponse({ present: !!window.__onboardOverlay });
    }
});

} // End of if (!window.__ONBOARD_LOADED)