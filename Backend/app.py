# app.py - FIXED VERSION with better step detection

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import yaml
import logging
from datetime import datetime

from crm_simple import SimpleCRM, get_crm
from config import settings
from ai_engine import AIGuidanceEngine, GuidanceRequest

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

# Load KB
with open('action_kb.yaml', 'r', encoding='utf-8') as f:
    ACTION_KB = yaml.safe_load(f)

# Initialize AI
def initialize_ai_engine() -> Optional[AIGuidanceEngine]:
    if not settings.use_ai_guidance or not settings.gemini_api_key:
        logger.info("AI guidance disabled, using KB-only mode")
        return None
    
    try:
        logger.info(f"Initializing Gemini engine: {settings.gemini_model}")
        ai_engine = AIGuidanceEngine(
            api_key=settings.gemini_api_key,
            model=settings.gemini_model
        )
        logger.info(f"✓ AI guidance engine initialized")
        return ai_engine
    except Exception as e:
        logger.error(f"Failed to initialize AI engine: {e}")
        logger.warning("Falling back to KB-only guidance")
        return None

# Global instances
crm: Optional[SimpleCRM] = None
ai_engine: Optional[AIGuidanceEngine] = None
kb_engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global crm, ai_engine, kb_engine
    
    logger.info("🚀 Starting ONBOARD.AI Backend...")
    
    crm = get_crm(settings.crm_api_base_url, settings.crm_api_key)
    connected = await crm.connect()
    if connected:
        logger.info(f"✓ CRM connected ({settings.crm_api_base_url})")
    else:
        logger.warning(f"⚠ CRM connection test failed, continuing anyway")
    
    ai_engine = initialize_ai_engine()
    
    from guidance_generator import GuidanceGenerator
    kb_engine = GuidanceGenerator(ACTION_KB)
    logger.info("✓ Knowledge Base loaded")
    
    logger.info("✅ Backend ready!")
    
    yield
    
    logger.info("Shutting down...")
    if crm:
        await crm.disconnect()
        logger.info("CRM disconnected")

app = FastAPI(
    title="ONBOARD.AI with Gen AI",
    version="4.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class PageContext(BaseModel):
    url: str
    page_title: str
    visible_text: str
    dom_elements: List[str] = Field(default_factory=list)
    employee_id: str
    task_id: Optional[str] = None
    previous_actions: List[str] = Field(default_factory=list)
    current_step: Optional[int] = None

class OverlayAction(BaseModel):
    target_selector: str
    action_type: str
    message: str
    position: Optional[str] = "bottom"
    animation: Optional[str] = "pulse"
    priority: Optional[int] = 3
    alternatives: List[str] = Field(default_factory=list)

class GuidanceResponse(BaseModel):
    actions: List[OverlayAction]
    tip: Optional[str] = None
    explanation: Optional[str] = None
    step_number: int
    total_steps: int
    task_complete: bool = False
    confidence: Optional[float] = None
    next_step_prediction: Optional[str] = None
    ai_generated: bool = False
    step_description: Optional[str] = None
    guidance_text: Optional[str] = None

class AIGuidanceToggle(BaseModel):
    enabled: bool

# API Endpoints
@app.get("/")
def read_root():
    return {
        "message": "ONBOARD.AI with Generative AI",
        "version": "4.0.0",
        "features": ["AI Guidance", "KB Fallback", "CRM Integration"],
        "ai_enabled": settings.use_ai_guidance,
        "ai_provider": settings.ai_provider if settings.use_ai_guidance else None
    }

@app.post("/api/guidance", response_model=GuidanceResponse)
async def get_guidance(context: PageContext, background_tasks: BackgroundTasks):
    """Generate AI-powered or KB-based guidance"""
    
    employee = await crm.get_employee(context.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get current task
    tasks = await crm.get_tasks(context.employee_id)
    
    if context.task_id:
        current_task = next((t for t in tasks if t['id'] == context.task_id), None)
    else:
        current_task = None
        for task in tasks:
            if task['status'] in ['in_progress', 'assigned']:
                platform = task.get('platform', '')
                if platform and platform in context.url.lower():
                    current_task = task
                    break
    
    if not current_task:
        raise HTTPException(status_code=404, detail="No active task found")
    
    # Parse task type
    task_type = current_task['type']
    task_platform = current_task.get('platform', '')
    
    if '_' in task_type:
        platform, action_part = task_type.split('_', 1)
    else:
        platform = task_platform.split('.')[0] if '.' in task_platform else task_platform
        action_part = task_type
    
    action_id = task_type
    
    try:
        # Use AI if available
        if ai_engine:
            ai_request = GuidanceRequest(
                task_title=current_task['title'],
                task_description=current_task.get('description', ''),
                current_url=context.url,
                page_title=context.page_title,
                visible_text=context.visible_text,
                dom_elements=context.dom_elements,
                step_number=current_task['steps_completed'] + 1,
                total_steps=current_task['total_steps'],
                previous_actions=context.previous_actions
            )
            
            ai_guidance = await ai_engine.generate_guidance(ai_request)
            
            overlay_actions = []
            for action in ai_guidance.actions:
                overlay_actions.append(OverlayAction(
                    target_selector=action.selector,
                    action_type=action.action_type,
                    message=action.message,
                    position="bottom",
                    animation="pulse" if action.action_type in ['click', 'submit'] else "fade",
                    priority=action.priority,
                    alternatives=action.alternatives
                ))
            
            guidance_tip = ai_guidance.tip
            guidance_explanation = ai_guidance.explanation
            guidance_confidence = ai_guidance.confidence
            guidance_next_step = ai_guidance.next_step_prediction
            step_description = None
            guidance_text = None
        else:
            # KB fallback
            logger.info(f"Using KB: platform='{platform}', action_id='{action_id}', step={current_task['steps_completed']}")
            
            # Pass current_step in context for detection
            context_dict = context.dict()
            context_dict['current_step'] = current_task['steps_completed']
            
            kb_guidance = kb_engine.generate_guidance(platform, action_id, context_dict, current_task['steps_completed'])
            
            logger.info(f"KB returned {len(kb_guidance.actions)} actions")
            
            overlay_actions = []
            for kb_action in kb_guidance.actions:
                overlay_actions.append(OverlayAction(
                    target_selector=kb_action.selector,
                    action_type=kb_action.action_type,
                    message=kb_action.message,
                    position="bottom",
                    animation="pulse" if kb_action.action_type in ['click', 'submit'] else "fade",
                    priority=kb_action.priority,
                    alternatives=kb_action.alternatives
                ))
            
            guidance_tip = kb_guidance.tip
            guidance_explanation = kb_guidance.explanation
            guidance_confidence = kb_guidance.confidence
            guidance_next_step = kb_guidance.next_step_prediction
            step_description = kb_guidance.step_description
            guidance_text = kb_guidance.guidance_text
        
        # FIXED: Detect step advancement based on URL patterns
        detected_step = detect_step_from_url(platform, action_id, context.url, current_task['steps_completed'])
        
        logger.info(f"Step detection: current={current_task['steps_completed']}, detected={detected_step}, total={current_task['total_steps']}")
        
        # Update task if step advanced
        if detected_step > current_task['steps_completed']:
            logger.info(f"Auto-advancing task from step {current_task['steps_completed']} to {detected_step}")
            background_tasks.add_task(
                crm.update_task,
                current_task['id'],
                context.employee_id,
                detected_step,
                'completed' if detected_step >= current_task['total_steps'] else 'in_progress'
            )
            current_task['steps_completed'] = detected_step
        
        # Check completion - task is complete when detected_step >= total_steps
        task_complete = detected_step >= current_task['total_steps']
        
        logger.info(f"Task complete: {task_complete} (detected_step={detected_step} >= total={current_task['total_steps']})")
        
        if task_complete:
            logger.info("Marking task as completed in CRM")
            background_tasks.add_task(
                crm.delete_task,  # Auto-delete completed tasks
                current_task['id'],
                context.employee_id
            )
        
        return GuidanceResponse(
            actions=overlay_actions,
            tip=guidance_tip,
            explanation=guidance_explanation,
            step_number=detected_step + 1,
            total_steps=current_task['total_steps'],
            task_complete=task_complete,
            confidence=guidance_confidence,
            next_step_prediction=guidance_next_step,
            ai_generated=settings.use_ai_guidance,
            step_description=step_description,
            guidance_text=guidance_text
        )
    
    except Exception as e:
        logger.error(f"Guidance generation failed: {e}", exc_info=True)
        
        return GuidanceResponse(
            actions=[
                OverlayAction(
                    target_selector="body",
                    action_type="tooltip",
                    message=f"Continue with: {current_task['title']}",
                    position="top"
                )
            ],
            tip="Navigate to complete this step",
            explanation="We're here to help!",
            step_number=current_task['steps_completed'] + 1,
            total_steps=current_task['total_steps'],
            task_complete=False,
            ai_generated=False
        )

def detect_step_from_url(platform: str, action_id: str, url: str, current_step: int) -> int:
    """Detect which step user is on based on URL patterns"""
    url_lower = url.lower()
    
    # GitHub repository creation flow
    if 'github.com' in url_lower and 'repo' in action_id.lower():
        # Step 2+: On a repository page (created) -> TASK COMPLETE!
        # Pattern: github.com/username/reponame (but NOT /new or /repositories)
        # Example: github.com/sadreammn/test1
        parts = [p for p in url_lower.replace('https://', '').replace('http://', '').split('/') if p and p != 'github.com']
        
        # If we have username/reponame pattern (2+ parts) and NOT on /new page
        if len(parts) >= 2 and '/new' not in url_lower and '/repositories' not in url_lower:
            logger.info(f"Repository detected in URL: {parts}, marking as complete")
            return 3  # Task complete (repo was created)
        
        # Step 1: On /new page -> filling form
        if '/new' in url_lower:
            return max(current_step, 1)
        
        # Step 0: On github.com homepage or dashboard
        if url_lower.endswith('github.com') or url_lower.endswith('github.com/'):
            return 0
    
    # Add more platform-specific detection here
    
    return current_step

@app.post("/api/chat/parse-task")
async def parse_task_from_chat(msg: Dict):
    """Parse task with AI enhancement"""
    
    from action_matcher import ActionMatcher
    action_matcher = ActionMatcher(ACTION_KB)
    
    matches = action_matcher.match(msg['message'], msg.get('context'))
    
    if settings.use_ai_guidance and ai_engine and (not matches or matches[0]['confidence'] < 0.7):
        try:
            import asyncio
            import json
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: ai_engine.client.generate_content(
                    f"""User request: "{msg['message']}"

Available platforms: GitHub, Slack, Jira, Figma
Current URL: {msg.get('context', {}).get('url', 'unknown')}

What is the user trying to accomplish? Return JSON:
{{
    "intent": "clear description",
    "platform": "best matching platform",
    "action": "specific action",
    "confidence": 0.0-1.0
}}""",
                    generation_config={
                        "temperature": 0.3,
                        "response_mime_type": "application/json"
                    }
                )
            )
            ai_intent = json.loads(response.text)
            
            clarified_query = f"{ai_intent['platform']} {ai_intent['action']}"
            matches = action_matcher.match(clarified_query, msg.get('context'))
            
            if matches:
                matches[0]['confidence'] = min(matches[0]['confidence'] + 0.2, 1.0)
        
        except Exception as e:
            logger.error(f"AI intent parsing failed: {e}")
    
    if not matches:
        return {
            "understood": False,
            "message": "I couldn't find a matching task. Can you be more specific?"
        }
    
    best_match = matches[0]
    
    return {
        "understood": True,
        "task": {
            "platform": best_match['platform'],
            "action_id": best_match.get('id', best_match['key']),
            "title": best_match['title'],
            "confidence": best_match['confidence']
        },
        "message": f"Got it! I'll guide you through: {best_match['title']}",
        "matches": matches[:3],
        "ai_enhanced": settings.use_ai_guidance
    }

@app.post("/api/ai/toggle")
async def toggle_ai_guidance(toggle: AIGuidanceToggle):
    """Enable/disable AI guidance at runtime"""
    global settings
    settings.use_ai_guidance = toggle.enabled
    
    return {
        "ai_enabled": settings.use_ai_guidance,
        "message": f"AI guidance {'enabled' if toggle.enabled else 'disabled'}"
    }

@app.get("/api/ai/status")
async def get_ai_status():
    """Get AI engine status"""
    return {
        "ai_enabled": settings.use_ai_guidance,
        "provider": "gemini",
        "model": settings.gemini_model,
        "engine_initialized": ai_engine is not None,
        "kb_loaded": kb_engine is not None
    }

@app.get("/api/employees/{employee_id}/tasks")
async def get_all_employee_tasks(employee_id: str):
    """Fetch all tasks for an employee"""
    employee = await crm.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    all_tasks = await crm.get_tasks(employee_id)
    return all_tasks

@app.post("/api/employee/task")
async def get_employee_task(request: Dict):
    """Fetch active tasks"""
    employee_id = request['employee_id']
    current_url = request['current_url']
    
    employee = await crm.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    all_tasks = await crm.get_tasks(employee_id)
    
    relevant_tasks = []
    for task in all_tasks:
        if task['status'] in ['in_progress', 'assigned', 'pending']:
            platform = task.get('platform', '')
            if platform and platform in current_url.lower():
                relevant_tasks.append(task)
    
    if not relevant_tasks:
        return {
            "has_active_task": False,
            "message": "No active task for this website",
            "employee": employee
        }
    
    return {
        "has_active_task": True,
        "employee": employee,
        "task": relevant_tasks[0]
    }

@app.post("/api/chat/create-task")
async def create_task_from_chat(data: Dict):
    """Create CRM task from chat"""
    try:
        employee_id = data.get('employee_id')
        task_data = data.get('task', {})
        
        if not employee_id or not task_data:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "Missing employee_id or task data"}
            )
        
        # Get step count from KB
        try:
            platform_key = task_data.get('platform', '').split('.')[0]
            action_id = task_data.get('action_id', '')
            
            # Find action in KB
            action_def = None
            for p_key, p_data in ACTION_KB['platforms'].items():
                if p_key == platform_key:
                    for a_key, a_data in p_data['actions'].items():
                        if a_data.get('id') == action_id or a_key == action_id:
                            action_def = a_data
                            break
                if action_def:
                    break
            
            if action_def:
                total_steps = len(action_def['steps'])
            else:
                total_steps = 3  # Default
        except Exception as e:
            logger.warning(f"Could not determine steps from KB: {e}")
            total_steps = 3
        
        task_dict = {
            "title": task_data.get('title', 'Untitled Task'),
            "description": f"Task created via AI chat: {task_data.get('title', 'Task')}",
            "type": action_id,
            "platform": task_data.get('platform', platform_key),
            "total_steps": total_steps,
            "priority": 1
        }
        
        task_id = await crm.create_task(employee_id=employee_id, task=task_dict)
        
        if not task_id:
            raise Exception("Failed to create task in CRM")
        
        return {
            "success": True,
            "task_id": task_id,
            "message": "Task created! Starting AI-powered guidance..."
        }
    except Exception as e:
        logger.error(f"Error creating task from chat: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.post("/api/task/progress")
async def update_task_progress(data: Dict):
    """Update task progress (auto-deletes when completed)"""
    await crm.update_task(
        data['task_id'],
        data['employee_id'],
        data['step_completed'],
        'in_progress' if data['step_completed'] < 100 else 'completed'
    )
    
    return {"status": "success", "note": "Task deleted if completed"}

@app.post("/api/task/create")
async def create_task(data: Dict):
    """Manually create a new task for an employee"""
    task_id = await crm.create_task(
        employee_id=data['employee_id'],
        task={
            'title': data['title'],
            'description': data.get('description', ''),
            'type': data['type'],
            'platform': data['platform'],
            'total_steps': data['total_steps'],
            'priority': data.get('priority', 99)
        }
    )
    
    if task_id:
        return {
            "status": "success",
            "task_id": task_id,
            "message": f"Task '{data['title']}' created"
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to create task")

@app.delete("/api/task/{task_id}")
async def delete_task(task_id: str, employee_id: str):
    """Manually delete a task"""
    success = await crm.delete_task(task_id, employee_id)
    
    if success:
        return {"status": "success", "message": f"Task {task_id} deleted"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete task")

@app.get("/api/kb/actions")
async def list_all_actions():
    """List all available actions from knowledge base"""
    actions = []
    for platform_id, platform_data in ACTION_KB['platforms'].items():
        for action_id, action_data in platform_data['actions'].items():
            actions.append({
                'id': action_data.get('id', f"{platform_id}_{action_id}"),
                'platform': platform_data['name'],
                'title': action_data['title'],
                'steps': len(action_data['steps'])
            })
    return {"actions": actions}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=settings.debug)