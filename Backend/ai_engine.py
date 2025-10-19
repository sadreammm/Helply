# ai_engine.py - Gemini-Powered Guidance Engine

from typing import List, Dict, Optional
from pydantic import BaseModel, Field
import json
import logging

logger = logging.getLogger(__name__)


class GuidanceRequest(BaseModel):
    """Request for AI guidance generation"""
    task_title: str
    task_description: str
    current_url: str
    page_title: str
    visible_text: str
    dom_elements: List[str]
    step_number: int
    total_steps: int
    previous_actions: List[str] = Field(default_factory=list)


class GuidanceAction(BaseModel):
    """Single guidance action for overlay"""
    selector: str
    action_type: str  # click, type, highlight, navigate
    message: str
    priority: int = 3  # 1-5, 5 being highest
    reasoning: str = ""  # Why this action
    alternatives: List[str] = Field(default_factory=list)  # Alternative selectors


class AIGuidanceResponse(BaseModel):
    """AI-generated guidance response"""
    actions: List[GuidanceAction]
    tip: str = ""
    explanation: str = ""
    confidence: float = 0.8
    next_step_prediction: Optional[str] = None
    potential_issues: List[str] = Field(default_factory=list)


class AIGuidanceEngine:
    """Gemini-powered guidance engine"""
    
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash-lite"):
        self.api_key = api_key
        self.model = model
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Gemini client"""
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self.client = genai.GenerativeModel(self.model)
            logger.info(f"✓ Gemini client initialized (model: {self.model})")
        except ImportError:
            logger.error("Google Generative AI package not installed. Run: pip install google-generativeai")
            raise ImportError("Install google-generativeai package: pip install google-generativeai")
    
    async def generate_guidance(self, request: GuidanceRequest) -> AIGuidanceResponse:
        """Generate context-aware guidance using Gemini"""
        
        if not self.client:
            logger.error("Gemini client not initialized")
            return self._create_fallback_guidance(request)
        
        try:
            # Build prompts
            system_prompt = self._build_system_prompt()
            user_prompt = self._build_user_prompt(request)
            
            # Call Gemini
            response = await self._call_gemini(system_prompt, user_prompt)
            
            # Parse and validate response
            return self._parse_ai_response(response, request)
        
        except Exception as e:
            logger.error(f"AI guidance generation failed: {e}", exc_info=True)
            return self._create_fallback_guidance(request)
    
    def _build_system_prompt(self) -> str:
        """Build system prompt for OpenAI"""
        return """You are an expert onboarding assistant that generates step-by-step guidance for web applications.

Your role:
1. Analyze the current page context (URL, title, visible text, DOM elements)
2. Identify the most relevant interactive elements for the current task step
3. Generate clear, actionable instructions with CSS selectors
4. Provide helpful tips and context
5. Anticipate potential issues

Output Format (JSON):
{
    "actions": [
        {
            "selector": "CSS selector for element",
            "action_type": "click|type|highlight|navigate",
            "message": "Clear instruction for user",
            "priority": 1-5,
            "reasoning": "Why this action is needed",
            "alternatives": ["backup selector 1", "backup selector 2"]
        }
    ],
    "tip": "Helpful tip or context",
    "explanation": "Overall guidance explanation",
    "confidence": 0.0-1.0,
    "next_step_prediction": "What likely happens next",
    "potential_issues": ["Issue 1", "Issue 2"]
}

Guidelines:
- Be specific with selectors (prefer IDs, then data attributes, then classes)
- Provide 2-3 alternative selectors when possible
- Use friendly, encouraging language
- Explain the "why" behind actions
- Anticipate common mistakes
- Keep messages concise (under 100 chars)
- Priority 5 = critical action, 1 = optional/informational"""
    
    def _build_user_prompt(self, request: GuidanceRequest) -> str:
        """Build user prompt with context"""
        # Truncate for token efficiency
        dom_sample = request.dom_elements[:50] if len(request.dom_elements) > 50 else request.dom_elements
        visible_text_sample = request.visible_text[:2000] if len(request.visible_text) > 2000 else request.visible_text
        
        return f"""Task: {request.task_title}
Description: {request.task_description}

Current Step: {request.step_number} of {request.total_steps}

Page Context:
- URL: {request.current_url}
- Title: {request.page_title}
- Visible Text Preview: {visible_text_sample}
- Interactive Elements Detected: {', '.join(dom_sample)}

Previous Actions: {', '.join(request.previous_actions) if request.previous_actions else 'None (first step)'}

Analyze this page and provide guidance for step {request.step_number}. What should the user do next?

Return ONLY valid JSON matching the specified format."""
    
    async def _call_gemini(self, system_prompt: str, user_prompt: str) -> str:
        """Call Gemini API"""
        import asyncio
        
        # Combine system and user prompts for Gemini
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        # Gemini doesn't have native async, so wrap in executor
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.generate_content(
                full_prompt,
                generation_config={
                    "temperature": 0.3,
                    "response_mime_type": "application/json"
                }
            )
        )
        
        return response.text
    
    def _parse_ai_response(self, ai_response: str, request: GuidanceRequest) -> AIGuidanceResponse:
        """Parse and validate AI response"""
        try:
            data = json.loads(ai_response)
            
            # Convert to GuidanceAction objects
            actions = []
            for action_data in data.get('actions', []):
                actions.append(GuidanceAction(
                    selector=action_data.get('selector', 'body'),
                    action_type=action_data.get('action_type', 'highlight'),
                    message=action_data.get('message', 'Continue...'),
                    priority=action_data.get('priority', 3),
                    reasoning=action_data.get('reasoning', ''),
                    alternatives=action_data.get('alternatives', [])
                ))
            
            return AIGuidanceResponse(
                actions=actions,
                tip=data.get('tip', ''),
                explanation=data.get('explanation', ''),
                confidence=data.get('confidence', 0.8),
                next_step_prediction=data.get('next_step_prediction'),
                potential_issues=data.get('potential_issues', [])
            )
        
        except Exception as e:
            logger.error(f"Failed to parse AI response: {e}")
            logger.debug(f"Raw response: {ai_response}")
            return self._create_fallback_guidance(request)
    
    def _create_fallback_guidance(self, request: GuidanceRequest) -> AIGuidanceResponse:
        """Create fallback guidance when AI fails"""
        return AIGuidanceResponse(
            actions=[
                GuidanceAction(
                    selector="body",
                    action_type="highlight",
                    message=f"Continue with step {request.step_number}",
                    priority=3,
                    reasoning="Fallback guidance",
                    alternatives=[]
                )
            ],
            tip="Navigate to complete this step",
            explanation="We're here to help you succeed!",
            confidence=0.6,
            next_step_prediction=None,
            potential_issues=[]
        )
