# app.py - ONBOARD.AI Backend with Dynamic CRM Integration
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from datetime import datetime
import logging

# Import CRM integration
from crm import CRMAdapter, get_crm_adapter
from config import settings

# Configure logging
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title="ONBOARD.AI CRM Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= CRM INITIALIZATION =============
# Initialize CRM adapter based on configuration

def initialize_crm() -> CRMAdapter:
    """Initialize CRM adapter from configuration"""
    logger.info(f"Initializing CRM adapter: {settings.crm_type}")
    
    if settings.crm_type == "mock":
        return get_crm_adapter("mock")
    
    elif settings.crm_type == "salesforce":
        return get_crm_adapter(
            "salesforce",
            username=settings.salesforce_username,
            password=settings.salesforce_password,
            security_token=settings.salesforce_security_token,
            domain=settings.salesforce_domain
        )
    
    elif settings.crm_type == "hubspot":
        return get_crm_adapter(
            "hubspot",
            api_key=settings.hubspot_api_key,
            access_token=settings.hubspot_access_token
        )
    
    elif settings.crm_type == "generic_rest":
        return get_crm_adapter(
            "generic_rest",
            base_url=settings.crm_api_base_url,
            api_key=settings.crm_api_key,
            api_secret=settings.crm_api_secret
        )
    
    else:
        logger.warning(f"Unknown CRM type: {settings.crm_type}, falling back to mock")
        return get_crm_adapter("mock")

# Initialize CRM on startup
crm: Optional[CRMAdapter] = None

@app.on_event("startup")
async def startup_event():
    """Initialize CRM connection on startup"""
    global crm
    crm = initialize_crm()
    connected = await crm.connect()
    if connected:
        logger.info(f"✓ CRM connected successfully ({settings.crm_type})")
    else:
        logger.error(f"✗ CRM connection failed ({settings.crm_type})")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup CRM connection on shutdown"""
    if crm:
        await crm.disconnect()
        logger.info("CRM disconnected")



# ============= MODELS =============

class EmployeeTaskRequest(BaseModel):
    employee_id: str
    current_url: str

class PageContext(BaseModel):
    url: str
    page_title: str
    visible_text: str
    dom_elements: List[str] = Field(default_factory=list)
    employee_id: str
    task_id: Optional[str] = None

class OverlayAction(BaseModel):
    target_selector: str
    action_type: str
    message: str
    position: Optional[str] = "bottom"
    animation: Optional[str] = "pulse"
    wait_for_element: Optional[bool] = True

class GuidanceResponse(BaseModel):
    actions: List[OverlayAction]
    tip: Optional[str] = None
    step_number: int
    total_steps: int
    task_complete: bool = False
    next_task: Optional[Dict] = None

class TaskProgressUpdate(BaseModel):
    employee_id: str
    task_id: str
    step_completed: int
    action_taken: Optional[str] = None
    metadata: Optional[Dict] = None

# ============= API ENDPOINTS =============

@app.get("/")
def read_root():
    return {
        "message": "ONBOARD.AI CRM Backend",
        "version": "2.0.0",
        "status": "active",
        "crm_connected": True
    }

@app.post("/api/employee/task")
async def get_employee_task(request: EmployeeTaskRequest):
    """
    Fetch active onboarding tasks for employee from CRM
    Returns the highest priority task relevant to current URL
    """
    employee = await crm.get_employee(request.employee_id)
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found in CRM")
    
    # Get all tasks for employee
    all_tasks = await crm.get_employee_tasks(request.employee_id)
    
    # Filter tasks relevant to current URL
    relevant_tasks = [
        task for task in all_tasks
        if is_task_relevant_to_url(task, request.current_url)
    ]
    
    if not relevant_tasks:
        return {
            "has_active_task": False,
            "message": "No active task for this website",
            "employee": employee,
            "upcoming_tasks": [t for t in all_tasks if t['status'] == 'pending'][:3]
        }
    
    # Return highest priority active task
    current_task = relevant_tasks[0]
    
    return {
        "has_active_task": True,
        "employee": {
            "id": request.employee_id,
            **employee
        },
        "task": current_task,
        "total_tasks_remaining": len([t for t in all_tasks if t['status'] != 'completed'])
    }

def is_task_relevant_to_url(task: Dict, url: str) -> bool:
    """Check if task is relevant to current URL"""
    platform = task.get('platform', '')
    
    # Only show in-progress or newly assigned tasks
    if task['status'] not in ['in_progress', 'assigned']:
        return False
    
    return platform in url.lower()

@app.post("/api/guidance", response_model=GuidanceResponse)
async def get_guidance(context: PageContext):
    """
    Generate context-aware guidance for current page
    Uses page analysis to detect progress automatically
    """
    employee = await crm.get_employee(context.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get current task
    tasks = await crm.get_employee_tasks(context.employee_id)
    current_task = None
    
    if context.task_id:
        current_task = next((t for t in tasks if t['id'] == context.task_id), None)
    else:
        # Get first relevant task
        current_task = next((t for t in tasks if is_task_relevant_to_url(t, context.url)), None)
    
    if not current_task:
        raise HTTPException(status_code=404, detail="No active task found")
    
    # Auto-detect progress from page context
    progress_detected = await detect_progress_from_context(context, current_task, context.employee_id)
    
    if progress_detected:
        # Refresh task data after auto-progress
        tasks = await crm.get_employee_tasks(context.employee_id)
        current_task = next((t for t in tasks if t['id'] == current_task['id']), current_task)
    
    # Generate contextual guidance
    guidance = generate_contextual_guidance(context, current_task)
    
    # Check if task is complete and get next task
    if guidance.task_complete:
        next_tasks = [t for t in tasks if t['status'] in ['pending', 'assigned']]
        if next_tasks:
            guidance.next_task = {
                "id": next_tasks[0]['id'],
                "title": next_tasks[0]['title'],
                "platform": next_tasks[0]['platform']
            }
    
    return guidance

async def detect_progress_from_context(context: PageContext, task: Dict, 
                                      employee_id: str) -> bool:
    """
    Automatically detect task progress based on page context
    Returns True if progress was updated
    """
    url = context.url.lower()
    visible_text = context.visible_text.lower()
    dom_elements = ' '.join(context.dom_elements).lower()
    
    current_step = task['steps_completed']
    task_type = task['type']
    updated = False
    
    if task_type == "github_repo_creation":
        # Step 0 -> 1: User navigated to create repo page
        if current_step == 0 and "github.com/new" in url:
            await crm.update_task_progress(task['id'], employee_id, 1, 'in_progress')
            await crm.log_employee_action(employee_id, "navigated_to_create_repo", 
                                         {"url": context.url})
            updated = True
        
        # Step 1 -> 2: User is on /new page and has filled form (detect via DOM)
        elif current_step == 1 and "github.com/new" in url:
            # Check if form looks filled (repository name input has value)
            if 'value=' in dom_elements and 'repository' in dom_elements:
                # Don't auto-advance here - wait for actual submission
                pass
        
        # Step 2 -> 3: Repository created (now on repo page)
        elif current_step <= 2 and is_repository_page(context):
            await crm.update_task_progress(task['id'], employee_id, 
                                          task['total_steps'], 'completed')
            await crm.log_employee_action(employee_id, "repository_created", 
                                         {"url": context.url})
            updated = True
    
    elif task_type == "github_clone":
        # Detect clone workflow progress
        if current_step == 0 and ("/repos" in url or is_repository_page(context)):
            await crm.update_task_progress(task['id'], employee_id, 1, 'in_progress')
            updated = True
        
        elif current_step == 1 and "code-button" in dom_elements:
            # User clicked code button
            await crm.update_task_progress(task['id'], employee_id, 2, 'in_progress')
            updated = True
    
    elif task_type == "github_pull_request":
        # Detect PR workflow
        if current_step == 0 and ("/pull/new" in url or "/compare" in url):
            await crm.update_task_progress(task['id'], employee_id, 1, 'in_progress')
            updated = True
        
        elif current_step <= 3 and "/pull/" in url and "/pull/new" not in url:
            # PR created (on PR view page)
            await crm.update_task_progress(task['id'], employee_id, 
                                          task['total_steps'], 'completed')
            updated = True
    
    return updated

def generate_contextual_guidance(context: PageContext, task: Dict) -> GuidanceResponse:
    """Generate step-by-step overlay guidance based on page context"""
    url = context.url.lower()
    page_title = context.page_title.lower()
    dom_elements = ' '.join(context.dom_elements).lower()
    
    actions = []
    tip = None
    step_number = task['steps_completed'] + 1
    total_steps = task['total_steps']
    task_complete = task['status'] == 'completed'
    
    if task_complete:
        actions = [
            OverlayAction(
                target_selector="body",
                action_type="tooltip",
                message=f"🎉 Task completed: {task['title']}",
                position="top",
                animation="fade"
            )
        ]
        return GuidanceResponse(
            actions=actions,
            tip="Great job! Move on to your next task.",
            step_number=total_steps,
            total_steps=total_steps,
            task_complete=True
        )
    
    # ===== GITHUB REPO CREATION =====
    if task['type'] == "github_repo_creation":
        
        if step_number == 1:
            # Step 1: Guide user to create new repo (works on any GitHub page)
            actions = [
                # Navbar '+' button (works on all GitHub pages)
                OverlayAction(
                    target_selector="summary[aria-label*='Create'], summary[aria-label*='new'], [data-target='create-menu.button']",
                    action_type="highlight",
                    message="👋 Click the '+' menu in the top navigation bar",
                    position="bottom",
                    animation="pulse"
                ),
                # Left sidebar button (on dashboard/home)
                OverlayAction(
                    target_selector="a[href='/new'], a[href*='/repositories/new']",
                    action_type="highlight",
                    message="Or click 'New' here to create a repository",
                    position="right",
                    animation="pulse"
                )
            ]
            tip = "💡 A repository is like a project folder that tracks all your code changes."
        
        elif step_number == 2 and "github.com/new" in url:
            # Step 2: Fill out repository form
            actions = [
                OverlayAction(
                    target_selector="input#repository_name, input[name='repository[name]']",
                    action_type="highlight",
                    message="📝 Enter 'my-first-project' as your repository name",
                    position="bottom",
                    animation="pulse"
                ),
                OverlayAction(
                    target_selector="input#repository_description, textarea[name='repository[description]']",
                    action_type="tooltip",
                    message="Add a description (optional but recommended)",
                    position="bottom"
                ),
                OverlayAction(
                    target_selector="input#repository_auto_init, input[name='repository[auto_init]']",
                    action_type="highlight",
                    message="✅ Check this to add a README file",
                    position="right",
                    animation="pulse"
                ),
                OverlayAction(
                    target_selector="button[type='submit'], button.btn-primary[data-disable-with]",
                    action_type="highlight",
                    message="🚀 Click 'Create repository' when ready!",
                    position="top",
                    animation="pulse"
                )
            ]
            tip = "💡 Pro tip: Always add a README - it's the first thing people see!"
    
    # ===== GITHUB CLONE =====
    elif task['type'] == "github_clone":
        
        if step_number == 1:
            actions = [
                OverlayAction(
                    target_selector="button#code-button, button[data-target*='get-repo']",
                    action_type="highlight",
                    message="Click the 'Code' button",
                    position="bottom",
                    animation="pulse"
                )
            ]
            tip = "You'll copy the URL to clone this repository"
        
        elif step_number == 2:
            actions = [
                OverlayAction(
                    target_selector="input[aria-label*='Clone'], input.js-url-field",
                    action_type="highlight",
                    message="Copy this clone URL",
                    position="bottom"
                ),
                OverlayAction(
                    target_selector=".clipboard-copy-text, button[aria-label*='Copy']",
                    action_type="arrow",
                    message="Click to copy",
                    position="right",
                    animation="pulse"
                )
            ]
            tip = "Next: Open terminal and run 'git clone [paste-url]'"
    
    # ===== GITHUB PULL REQUEST =====
    elif task['type'] == "github_pull_request":
        
        if step_number <= 3 and ("/pull/new" in url or "/compare" in url):
            actions = [
                OverlayAction(
                    target_selector="input#pull_request_title, input[name='pull_request[title]']",
                    action_type="highlight",
                    message="Enter a clear title for your pull request",
                    position="bottom",
                    animation="pulse"
                ),
                OverlayAction(
                    target_selector="textarea#pull_request_body, textarea[name='pull_request[body]']",
                    action_type="tooltip",
                    message="Describe what changes you made and why",
                    position="bottom"
                ),
                OverlayAction(
                    target_selector="button.btn-primary[type='submit']",
                    action_type="highlight",
                    message="Click 'Create pull request' when ready",
                    position="top",
                    animation="pulse"
                )
            ]
            tip = "A good PR description helps reviewers understand your changes"
    
    # Default fallback
    if not actions:
        actions = [
            OverlayAction(
                target_selector="body",
                action_type="tooltip",
                message=f"Continue with: {task['title']} (Step {step_number}/{total_steps})",
                position="top"
            )
        ]
        tip = "Navigate to the correct page to see guidance"
    
    return GuidanceResponse(
        actions=actions,
        tip=tip,
        step_number=step_number,
        total_steps=total_steps,
        task_complete=False
    )

def is_repository_page(context: PageContext) -> bool:
    """Detect if current page is a GitHub repository page"""
    parts = [p for p in urlparse(context.url).path.split('/') if p]
    
    if len(parts) < 2:
        return False
    
    # Ignore non-repo pages
    if parts[0] in {"orgs", "settings", "notifications", "marketplace", "new", "search"}:
        return False
    
    # Check for repo indicators
    dom_text = ' '.join(context.dom_elements).lower()
    visible = context.visible_text.lower()
    
    return any([
        "#code-tab" in dom_text,
        "repository-content" in visible,
        "file-navigation" in dom_text,
        all(indicator in visible for indicator in ["code", "issues", "pull"])
    ])

@app.post("/api/task/progress")
async def update_task_progress(data: TaskProgressUpdate):
    """
    Manually update task progress (when user clicks 'next step' button)
    """
    success = await crm.update_task_progress(
        data.task_id,
        data.employee_id,
        data.step_completed,
        'in_progress' if data.step_completed < 100 else 'completed'
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Log the action
    await crm.log_employee_action(
        data.employee_id,
        data.action_taken or "manual_progress_update",
        data.metadata or {}
    )
    
    return {
        "status": "success",
        "message": "Progress updated",
        "steps_completed": data.step_completed
    }

@app.post("/api/task/submit")
async def submit_task_action(data: Dict):
    """
    Called when user performs a task action (e.g., clicks 'Create Repository' button)
    This advances the task before GitHub's navigation completes
    """
    employee_id = data.get("employee_id")
    task_id = data.get("task_id")
    action = data.get("action")  # e.g., "submit_create_repo"
    
    tasks = await crm.get_employee_tasks(employee_id)
    task = next((t for t in tasks if t['id'] == task_id), None)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Advance task based on action
    new_step = task['steps_completed'] + 1
    
    await crm.update_task_progress(
        task_id,
        employee_id,
        new_step,
        'in_progress'
    )
    
    await crm.log_employee_action(
        employee_id,
        action,
        {"task_id": task_id, "step": new_step}
    )
    
    return {"status": "success", "new_step": new_step}

@app.post("/api/feedback")
async def store_feedback(data: dict):
    """Store employee feedback and analytics"""
    employee_id = data.get("employee_id")
    
    await crm.log_employee_action(
        employee_id,
        "feedback_submitted",
        data
    )
    
    return {
        "status": "success",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)