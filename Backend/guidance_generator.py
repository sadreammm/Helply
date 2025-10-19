from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import yaml
import logging
import os
import re

logger = logging.getLogger(__name__)

KB_PATH = os.path.join(os.path.dirname(__file__), 'action_kb.yaml')


@dataclass
class KBActionItem:
    selector: str
    action_type: str = "highlight"
    message: str = ""
    priority: int = 3
    alternatives: List[str] = field(default_factory=list)


@dataclass
class KBGuidance:
    actions: List[KBActionItem]
    tip: Optional[str] = None
    explanation: Optional[str] = None
    confidence: float = 0.9
    next_step_prediction: Optional[str] = None
    step_description: Optional[str] = None
    guidance_text: Optional[str] = None


class GuidanceGenerator:
    def __init__(self, kb: Optional[Dict[str, Any]] = None):
        if kb is None:
            try:
                with open(KB_PATH, 'r', encoding='utf-8') as f:
                    self.kb = yaml.safe_load(f)
            except Exception as e:
                logger.error(f"Failed to load KB from {KB_PATH}: {e}")
                self.kb = {"platforms": {}}
        else:
            self.kb = kb

    def get_action_definition(self, platform: str, action_id: str) -> Optional[Dict[str, Any]]:
        logger.info(f"get_action_definition called with platform='{platform}', action_id='{action_id}'")
        platforms = self.kb.get('platforms', {})

        platform_key = platform.split('.')[0] if '.' in platform else platform
        logger.info(f"Extracted platform_key: '{platform_key}'")

        if platform_key in platforms:
            actions = platforms[platform_key].get('actions', {})
            
            if action_id in actions:
                logger.info(f"Found action by direct key: {action_id}")
                return actions[action_id]
            
            for k, v in actions.items():
                if v.get('id') == action_id:
                    logger.info(f"Found action by id field: {k}")
                    return v

            if '_' in action_id:
                action_part = action_id.replace(f"{platform_key}_", "", 1)
                logger.info(f"Extracted action_part: '{action_part}'")
                
                for k, v in actions.items():
                    if k == action_part or action_part in k:
                        logger.info(f"Matched action key: {k}")
                        return v

                    if v.get('id') == action_part or action_part in v.get('id', ''):
                        logger.info(f"Matched action id: {v.get('id')}")
                        return v
                    
                    if self._fuzzy_match(action_part, k) or self._fuzzy_match(action_part, v.get('id', '')):
                        logger.info(f"Fuzzy matched: {k}")
                        return v
        
        for p, pdata in platforms.items():
            for k, v in pdata.get('actions', {}).items():
                if v.get('id') == action_id or k == action_id:
                    logger.info(f"Found action across platforms: {k} in {p}")
                    return v
        
        logger.warning(f"No action found for platform='{platform}', action_id='{action_id}'")
        return None
    
    def _fuzzy_match(self, action_part: str, target: str) -> bool:
        a = action_part.lower().replace('_', '').replace('-', '')
        b = target.lower().replace('_', '').replace('-', '')
        
        if a in b or b in a:
            return True
        
        patterns = [
            (r'repo.*creation', r'create.*repository'),
            (r'pull.*request', r'create.*pr'),
            (r'issue.*creation', r'create.*issue'),
        ]
        
        for pattern1, pattern2 in patterns:
            if (re.search(pattern1, a) and re.search(pattern2, b)) or \
               (re.search(pattern2, a) and re.search(pattern1, b)):
                return True
        
        return False

    def detect_current_step(self, action_def: Dict, context: Dict) -> int:
        """Detect which step the user is currently on based on URL and page context"""
        url = context.get('url', '').lower()
        steps = action_def.get('steps', [])
        
        for i, step in enumerate(steps):
            page_pattern = step.get('page_pattern', '').lower()
            
            if page_pattern:
                pattern = page_pattern.replace('*', '')
                if pattern in url:
                    logger.info(f"Detected step {i} based on page_pattern: {page_pattern}")
                    return i

            completion = step.get('completion_indicators', [])
            if completion:
                visible_text = context.get('visible_text', '').lower()
                dom_elements = [el.lower() for el in context.get('dom_elements', [])]
                
                for indicator in completion:
                    indicator_lower = indicator.lower()
                    if indicator_lower in visible_text or \
                       any(indicator_lower in el for el in dom_elements):
                        logger.info(f"Step {i} appears complete (found indicator: {indicator})")
                        return min(i + 1, len(steps) - 1)
        
        return context.get('current_step', 0)

    def generate_guidance(self, platform: str, action_id: str, context: Dict[str, Any], current_step: int) -> KBGuidance:
        action_def = self.get_action_definition(platform, action_id)
        if not action_def:
            logger.warning(f"No action definition found, returning fallback guidance")
            return KBGuidance(
                actions=[KBActionItem(selector='body', message=f'Proceed with {action_id}', action_type='tooltip')],
                tip="Navigate to the appropriate page to continue",
                explanation=f"Looking for guidance for {action_id}",
                guidance_text=f"Please navigate to the correct page to continue with {action_id}"
            )

        steps = action_def.get('steps', [])
        if not steps:
            return KBGuidance(
                actions=[KBActionItem(selector='body', message='No steps defined', action_type='tooltip')],
                tip=None
            )
        detected_step = self.detect_current_step(action_def, context)
        if detected_step > current_step:
            logger.info(f"Auto-advancing from step {current_step} to {detected_step} based on page detection")
            step_index = detected_step
        else:
            step_index = current_step
        
        step_index = min(max(step_index, 0), len(steps) - 1)
        step = steps[step_index]
        
        logger.info(f"Generating guidance for step {step_index}: {step.get('message', 'N/A')}")

        step_selectors = step.get('selectors', [])
        tip = step.get('tip') or action_def.get('title')
        explanation = action_def.get('title')
        step_description = step.get('message', '')

        actions: List[KBActionItem] = []
        
        for sel in step_selectors:
            if isinstance(sel, str):
                actions.append(KBActionItem(
                    selector=sel,
                    action_type=step.get('action', 'highlight'),
                    message=step.get('message', ''),
                    priority=3
                ))
            elif isinstance(sel, dict):
                selector = sel.get('selector', 'body')
                msg = sel.get('message') or step.get('message', '')
                required = sel.get('required', False)
                priority = 4 if required else 3
                actions.append(KBActionItem(
                    selector=selector,
                    action_type=step.get('action', 'highlight'),
                    message=msg,
                    priority=priority
                ))

        if not actions:
            guidance_text = step.get('message', action_def.get('title', 'Proceed'))
            actions.append(KBActionItem(
                selector='body',
                action_type='tooltip',
                message=guidance_text,
                priority=2
            ))

        return KBGuidance(
            actions=actions,
            tip=tip,
            explanation=explanation,
            confidence=0.95,
            step_description=step_description,
            guidance_text=step.get('message', '')
        )


def load_kb_from_project(root_path: Optional[str] = None) -> Dict[str, Any]:
    path = KB_PATH if root_path is None else os.path.join(root_path, 'action_kb.yaml')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return {"platforms": {}}


_default_generator = GuidanceGenerator()

def get_default_generator() -> GuidanceGenerator:
    return _default_generator
