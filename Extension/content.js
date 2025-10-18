// content.js - Enhanced with better step detection and submit handling

const API_BASE = 'http://localhost:8000';
const EMPLOYEE_ID = 'emp_001';

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

    async checkForTask() {
        try {
            const proxy = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'proxy_fetch',
                    url: `${API_BASE}/api/employee/task`,
                    fetchOptions: {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            employee_id: EMPLOYEE_ID, 
                            current_url: window.location.href 
                        })
                    }
                }, resolve);
            });

            const data = proxy.body;
            
            if (data.has_active_task) {
                this.currentTask = data.task;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to fetch task:', error);
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
            }, 30000); // 30 seconds
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
        
        // Show task banner
        this.showTaskBanner();
        
        // Show progress bar
        this.showProgressBar();
        
        // Fetch and display guidance
        await this.updateGuidance();
        
        // Watch for page changes
        this.observePageChanges();

        // Attach submit listener when on create repo page
        this.attachCreateRepoSubmitListener();
    }

    showTaskBanner() {
        const banner = document.createElement('div');
        banner.className = 'onboard-task-banner';
        banner.id = 'onboard-task-banner';
        banner.innerHTML = `
            <div class="onboard-task-icon">${this.currentTask.steps_completed + 1}</div>
            <div class="onboard-task-text">
                <strong>${this.currentTask.title}</strong> - Step ${this.currentTask.steps_completed + 1} of ${this.currentTask.total_steps}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="onboard-close-btn" title="Next step" id="onboard-next-step">➜</button>
              <button class="onboard-close-btn" title="Close" id="onboard-close">×</button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        document.getElementById('onboard-close').addEventListener('click', () => {
            this.stopGuidance();
        });

        document.getElementById('onboard-next-step').addEventListener('click', async () => {
            const next = Math.min(this.currentTask.steps_completed + 1, this.currentTask.total_steps);
            await this.updateTaskProgress(next);
            this.currentTask.steps_completed = next;
            // refresh UI and guidance
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
            // temporary suppression to avoid re-prompting immediately after actions
            if (Date.now() < this.suppressUntil) return;
            // Get current page context
            const context = {
                url: window.location.href,
                page_title: document.title,
                visible_text: document.body.innerText.substring(0, 1000),
                dom_elements: this.getKeyDOMElements(),
                employee_id: EMPLOYEE_ID,
                task_id: this.currentTask.id
            };
            const proxy = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'proxy_fetch', url: `${API_BASE}/api/guidance`, fetchOptions: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context) } }, resolve);
            });

            this.currentGuidance = proxy.body;
            // If the backend progressed the task, mirror it locally
            if (this.currentGuidance?.step_number) {
                const newStep = this.currentGuidance.step_number - 1; // step_number is 1-based
                if (Number.isFinite(newStep) && newStep !== this.currentTask.steps_completed) {
                    this.currentTask.steps_completed = newStep;
                }
            }
            
            // Clear existing overlays
            this.clearOverlays();
            
            // Render new guidance
            this.renderGuidance();
            
            // Check if task complete
            if (this.currentGuidance.task_complete) {
                this.showCompletionMessage();
            }
            // Update visible banner/progress numbers
            const banner = document.getElementById('onboard-task-banner');
            if (banner) {
                banner.querySelector('.onboard-task-icon').textContent = String(this.currentTask.steps_completed + 1);
                banner.querySelector('.onboard-task-text').innerHTML = `
                    <strong>${this.currentTask.title}</strong> - Step ${this.currentTask.steps_completed + 1} of ${this.currentTask.total_steps}
                `;
            }
            const barFill = document.querySelector('.onboard-progress-fill');
            if (barFill) {
                const progress = (this.currentTask.steps_completed / this.currentTask.total_steps) * 100;
                barFill.style.width = `${progress}%`;
            }
            
        } catch (error) {
            console.error('Failed to fetch guidance:', error);
        }
    }

    getKeyDOMElements() {
        // Extract key interactive elements from the page
        const elements = [];
        document.querySelectorAll('button, a, input, select, summary').forEach(el => {
            if (el.offsetParent !== null) { // visible elements only
                elements.push(el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ')[0]}` : ''));
            }
        });
        return elements.slice(0, 50); // First 50 elements
    }

    renderGuidance() {
        if (!this.currentGuidance || !this.currentGuidance.actions) return;
        
        this.currentGuidance.actions.forEach((action, index) => {
            setTimeout(() => {
                const element = document.querySelector(action.target_selector);
                if (element) {
                    this.createOverlayForElement(element, action);
                }
            }, index * 300); // Stagger animations
        });
    }

    createOverlayForElement(element, action) {
        const rect = element.getBoundingClientRect();
        
        if (action.action_type === 'highlight') {
            const highlight = document.createElement('div');
            highlight.className = 'onboard-highlight onboard-overlay';
            highlight.style.left = `${rect.left + window.scrollX - 4}px`;
            highlight.style.top = `${rect.top + window.scrollY - 4}px`;
            highlight.style.width = `${rect.width + 8}px`;
            highlight.style.height = `${rect.height + 8}px`;
            document.body.appendChild(highlight);
        }
        
        // Always add tooltip with message
        const tooltip = document.createElement('div');
        tooltip.className = 'onboard-tooltip onboard-overlay';
        tooltip.innerHTML = `
            <div class="onboard-tooltip-arrow ${action.position}"></div>
            ${action.message}
        `;
        
        document.body.appendChild(tooltip);
        
        // Position tooltip
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
        } else { // left
            left = rect.left + window.scrollX - tooltipRect.width - 12;
            top = rect.top + window.scrollY + (rect.height / 2) - (tooltipRect.height / 2);
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    clearOverlays() {
        document.querySelectorAll('.onboard-overlay').forEach(el => el.remove());
    }

    observePageChanges() {
        // Watch for URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => this.updateGuidance(), 500);
                // attach submit listener again if on new repo page
                setTimeout(() => this.attachCreateRepoSubmitListener(), 600);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    attachCreateRepoSubmitListener() {
        // Only on GitHub new repo page
        if (!location.href.includes('github.com/new')) return;
        const form = document.querySelector('form[action*="/new"], form[method="post"]');
        const submitBtn = document.querySelector("button[type='submit'][data-disable-with], form[action*='/new'] button[type='submit']");
        if (!form || !submitBtn) return;

        if (this._submitBound) return; // bind once per page
        this._submitBound = true;

        const handler = async (e) => {
            try {
                // Immediately advance to next step locally and on backend
                const next = Math.min(this.currentTask.steps_completed + 1, this.currentTask.total_steps);
                await this.updateTaskProgress(next);
                this.currentTask.steps_completed = next;
                // Prevent noisy re-prompts for a short period while GitHub navigates
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
        
        // Update progress in CRM
        this.updateTaskProgress(this.currentTask.total_steps);
    }

    async updateTaskProgress(step) {
        try {
            await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'proxy_fetch', url: `${API_BASE}/api/task/progress`, fetchOptions: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: EMPLOYEE_ID, task_id: this.currentTask.id, step_completed: step }) } }, resolve);
            });
        } catch (error) {
            console.error('Failed to update progress:', error);
        }
    }

    stopGuidance() {
        this.overlayVisible = false;
        this.clearOverlays();
        document.getElementById('onboard-task-banner')?.remove();
        document.getElementById('onboard-progress-bar')?.remove();
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // store instance globally so background/popup can message it
        window.__onboardOverlay = new OnboardOverlay();
    });
} else {
    window.__onboardOverlay = new OnboardOverlay();
}

// Listen for messages from extension background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'refresh_guidance') {
        // refresh guidance (used by background/popup)
        if (window.__onboardOverlay) {
            window.__onboardOverlay.updateGuidance();
        } else {
            window.location.reload();
        }
    }
    
    // Background might ask to start guidance or check task
    if (request.action === 'start_guidance') {
        if (window.__onboardOverlay) window.__onboardOverlay.startGuidance();
    }

    if (request.action === 'check_task') {
        // Respond with basic presence so background knows content script is active
        sendResponse({ present: !!window.__onboardOverlay });
    }
});