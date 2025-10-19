# app.py - ONBOARD.AI Backend with Simplified CRM

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
import yaml
import logging
from datetime import datetime

# Import simplified CRM
from crm_simple import SimpleCRM, get_crm
from config import settings

# Import AI engine
from ai_engine import AIGuidanceEngine, GuidanceRequest

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

# ============= LOAD ACTION KNOWLEDGE BASE =============
# Load the project's KB file. The file in the repo is `action_kb.yaml`.
with open('action_kb.yaml', 'r', encoding='utf-8') as f:
    ACTION_KB = yaml.safe_load(f)

# ============= INITIALIZE AI ENGINE =============

def initialize_ai_engine() -> Optional[AIGuidanceEngine]:
    """Initialize OpenAI guidance engine"""
    
    if not settings.use_ai_guidance or not settings.openai_api_key:
        logger.info("AI guidance disabled, using KB-only mode")
        return None
    
    try:
        logger.info(f"Initializing OpenAI engine: {settings.openai_model}")
        
        ai_engine = AIGuidanceEngine(
            api_key=settings.openai_api_key,
            model=settings.openai_model
        )
        
        logger.info(f"✓ AI guidance engine initialized")
        return ai_engine
    
    except Exception as e:
        logger.error(f"Failed to initialize AI engine: {e}")
        logger.warning("Falling back to KB-only guidance")
        return None

# ============= GLOBAL INSTANCES =============
crm: Optional[SimpleCRM] = None
ai_engine: Optional[AIGuidanceEngine] = None
kb_engine = None

# ============= LIFESPAN EVENTS =============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global crm, ai_engine, kb_engine
    
    # Startup
    logger.info("🚀 Starting ONBOARD.AI Backend...")
    
    # Initialize simplified CRM
    crm = get_crm(settings.crm_api_base_url, settings.crm_api_key)
    connected = await crm.connect()
    if connected:
        logger.info(f"✓ CRM connected ({settings.crm_api_base_url})")
    else:
        logger.warning(f"⚠ CRM connection test failed, continuing anyway")
    
    # Initialize AI
    ai_engine = initialize_ai_engine()
    
    # Initialize KB engine
    from guidance_generator import GuidanceGenerator
    kb_engine = GuidanceGenerator(ACTION_KB)
    logger.info("✓ Knowledge Base loaded")
    
    logger.info("✅ Backend ready!")
    
    yield
    
    # Shutdown
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

# ============= MODELS =============

class PageContext(BaseModel):
    url: str
    page_title: str
    visible_text: str
    dom_elements: List[str] = Field(default_factory=list)
    employee_id: str
    task_id: Optional[str] = None
    previous_actions: List[str] = Field(default_factory=list)

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

class AIGuidanceToggle(BaseModel):
    enabled: bool

# ============= API ENDPOINTS =============

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
        # Find relevant task
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
    platform = current_task.get('platform', '')
    action_id = current_task['type'].replace(f"{platform}_", "") if platform else current_task['type']
    
    try:
        # Use AI if available, otherwise KB
        if ai_engine:
            # Prepare AI request
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
            
            # Convert AI response to our format
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
        else:
            # Fallback to KB
            kb_guidance = kb_engine.generate_guidance(platform, action_id, context, current_task['steps_completed'])
            overlay_actions = kb_guidance.get('actions', [])
        
        # Check if task complete
        detected_step = current_task['steps_completed']
        task_complete = detected_step >= current_task['total_steps'] - 1
        
        # Update progress if needed
        if detected_step > current_task['steps_completed']:
            background_tasks.add_task(
                crm.update_task,
                current_task['id'],
                context.employee_id,
                detected_step,
                'completed' if task_complete else 'in_progress'
            )
        
        return GuidanceResponse(
            actions=overlay_actions,
            tip=ai_guidance.tip,
            explanation=ai_guidance.explanation,
            step_number=current_task['steps_completed'] + 1,
            total_steps=current_task['total_steps'],
            task_complete=task_complete,
            confidence=ai_guidance.confidence,
            next_step_prediction=ai_guidance.next_step_prediction,
            ai_generated=settings.use_ai_guidance
        )
    
    except Exception as e:
        logger.error(f"Guidance generation failed: {e}")
        
        # Return generic fallback
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

@app.post("/api/chat/parse-task")
async def parse_task_from_chat(msg: Dict):
    """Parse task with AI enhancement"""
    
    from action_matcher import ActionMatcher  # Your existing matcher
    action_matcher = ActionMatcher(ACTION_KB)
    
    # Get basic matches from KB
    matches = action_matcher.match(msg['message'], msg.get('context'))
    
    # If AI enabled and low confidence, use AI to improve matching
    if settings.use_ai_guidance and ai_engine and (not matches or matches[0]['confidence'] < 0.7):
        try:
            # Use AI to understand intent better
            ai_prompt = f"""User request: "{msg['message']}"

Available platforms: GitHub, Slack, Jira, Figma
Current URL: {msg.get('context', {}).get('url', 'unknown')}

What is the user trying to accomplish? Return JSON:
{{
    "intent": "clear description",
    "platform": "best matching platform",
    "action": "specific action",
    "confidence": 0.0-1.0
}}"""
            
            # Get AI interpretation (OpenAI only)
            response = await ai_engine.client.chat.completions.create(
                model=ai_engine.model,
                messages=[{"role": "user", "content": ai_prompt}],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            import json
            ai_intent = json.loads(response.choices[0].message.content)
            
            # Re-match with AI-clarified intent
            clarified_query = f"{ai_intent['platform']} {ai_intent['action']}"
            matches = action_matcher.match(clarified_query, msg.get('context'))
            
            if matches:
                matches[0]['confidence'] = min(matches[0]['confidence'] + 0.2, 1.0)
        
        except Exception as e:
            logger.error(f"AI intent parsing failed: {e}")
    
    # Return matches
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
            "action_id": best_match['action_id'] if 'action_id' in best_match else best_match['platform'] + "_action",
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
        "provider": "openai",
        "model": settings.openai_model,
        "engine_initialized": ai_engine is not None,
        "kb_loaded": kb_engine is not None
    }

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
        if task['status'] in ['in_progress', 'assigned']:
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
    employee_id = data['employee_id']
    task_data = data['task']
    
    # Get step count from KB
    try:
        action_def = ACTION_KB['platforms'][task_data['platform']]['actions'][task_data['action_id']]
        total_steps = len(action_def['steps'])
    except:
        total_steps = 5  # Default
    
    crm_task = await crm.create_task(
        employee_id=employee_id,
        title=task_data['title'],
        type=f"{task_data['platform']}_{task_data['action_id']}",
        platform=task_data['platform'],
        description=f"Task created via AI chat: {task_data['title']}",
        total_steps=total_steps
    )
    
    return {
        "success": True,
        "task_id": crm_task['id'],
        "message": "Task created! Starting AI-powered guidance..."
    }

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
    """
    Manually create a new task for an employee
    
    Required fields:
    - employee_id
    - title
    - type (e.g., 'github_repo_creation')
    - platform (e.g., 'github.com')
    - total_steps
    - description (optional)
    - priority (optional, default 99)
    """
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
                'id': f"{platform_id}_{action_id}",
                'platform': platform_data['name'],
                'title': action_data['title'],
                'steps': len(action_data['steps'])
            })
    return {"actions": actions}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=settings.debug)