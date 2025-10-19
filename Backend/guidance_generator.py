"""guidance_generator.py

Simple Knowledge-Base guidance generator that reads the action KB structure
and produces guidance objects compatible with the AI guidance response used
by the backend (i.e., has .actions list with selector, action_type, message,
priority and alternatives).

This module intentionally avoids heavy dependencies and focuses on returning
plain Python objects (dataclasses/POPOs) that the rest of the app can use.
"""
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import yaml
import logging
import os

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


class GuidanceGenerator:
    """Load the YAML KB and provide accessors and a lightweight guidance
    generator that turns KB steps into guidance objects.
    """

    def __init__(self, kb: Optional[Dict[str, Any]] = None):
        if kb is None:
            # attempt to load from file next to this module
            try:
                with open(KB_PATH, 'r', encoding='utf-8') as f:
                    self.kb = yaml.safe_load(f)
            except Exception as e:
                logger.error(f"Failed to load KB from {KB_PATH}: {e}")
                self.kb = {"platforms": {}}
        else:
            self.kb = kb

    def get_action_definition(self, platform: str, action_id: str) -> Optional[Dict[str, Any]]:
        """Return the KB action dict for a given platform and action id.

        platform may be a short key like 'github' or full hostname; we try both.
        action_id can be full task type like 'github_repo_creation' or partial like 'create_repository'
        """
        logger.info(f"get_action_definition called with platform='{platform}', action_id='{action_id}'")
        platforms = self.kb.get('platforms', {})
        
        # Extract platform short name from full domain if needed
        # e.g., "github.com" -> "github"
        platform_key = platform.split('.')[0] if '.' in platform else platform
        logger.info(f"Extracted platform_key: '{platform_key}'")
        
        # First try direct platform match
        if platform_key in platforms:
            actions = platforms[platform_key].get('actions', {})
            
            # Try action_id as direct key
            if action_id in actions:
                return actions[action_id]
            
            # Try action_id as the 'id' field value
            for k, v in actions.items():
                if v.get('id') == action_id:
                    return v
            
            # Try matching by task type format (e.g., "github_repo_creation" -> "create_repository")
            # Common patterns: {platform}_{action} where action might be "repo_creation" -> "create_repository"
            if '_' in action_id:
                # Remove platform prefix if present
                action_part = action_id.replace(f"{platform_key}_", "")
                
                # Try variations
                variations = [
                    action_part,  # "repo_creation"
                    action_part.replace('_', ' '),  # "repo creation"
                    f"create_{action_part.replace('repo_', 'repository_')}",  # "create_repository_creation"
                ]
                
                # Check title and id fields for matches
                for k, v in actions.items():
                    title_lower = v.get('title', '').lower()
                    id_lower = v.get('id', '').lower()
                    
                    # Check if any variation appears in title or id
                    for var in variations:
                        if var.replace('_', ' ') in title_lower or var in id_lower:
                            return v
                    
                    # Special case: "repo_creation" matches "create_repository"
                    if 'creation' in action_part and 'create' in k:
                        if 'repo' in action_part and 'repository' in k:
                            logger.info(f"Matched '{action_id}' to action '{k}' via creation+repo pattern")
                            return v
                    
                    # Another special case: "github_repo_creation" matches "create_repository"
                    if action_id.endswith('_repo_creation') and k == 'create_repository':
                        logger.info(f"Matched '{action_id}' to 'create_repository' via direct pattern")
                        return v
        
        # Fallback: try matching by id across all platforms
        for p, pdata in platforms.items():
            for k, v in pdata.get('actions', {}).items():
                if v.get('id') == action_id or k == action_id:
                    return v
        
        return None

    def generate_guidance(self, platform: str, action_id: str, context: Dict[str, Any], current_step: int) -> KBGuidance:
        """Generate KB-only guidance for a given action and step.

        Returns KBGuidance with a list of KBActionItem objects.
        """
        action_def = self.get_action_definition(platform, action_id)
        if not action_def:
            # return a minimal fallback guidance
            return KBGuidance(actions=[KBActionItem(selector='body', message=f'Proceed with {action_id}')], tip=None)

        steps = action_def.get('steps', [])
        # clamp step index
        step_index = min(max(current_step, 0), len(steps)-1) if steps else 0
        step = steps[step_index] if steps else {}

        step_selectors = step.get('selectors', [])
        tip = step.get('tip') or action_def.get('tip') or action_def.get('description')
        explanation = action_def.get('title')

        actions: List[KBActionItem] = []
        # selectors may be a list of strings or dicts with selector/message/required
        for sel in step_selectors:
            if isinstance(sel, str):
                actions.append(KBActionItem(selector=sel, action_type=step.get('action', 'highlight'), message=step.get('message', ''), priority=3))
            elif isinstance(sel, dict):
                selector = sel.get('selector') or sel.get('selector')
                msg = sel.get('message') or step.get('message', '')
                required = sel.get('required', False)
                priority = 4 if required else 3
                actions.append(KBActionItem(selector=selector, action_type=step.get('action', 'highlight'), message=msg, priority=priority))

        # If no selectors were defined, fall back to a page-level tooltip
        if not actions:
            actions.append(KBActionItem(selector='body', action_type='tooltip', message=step.get('message', action_def.get('title', 'Proceed')), priority=2))

        return KBGuidance(actions=actions, tip=tip, explanation=explanation, confidence=0.95)


# Helper: load KB from project root if available
def load_kb_from_project(root_path: Optional[str] = None) -> Dict[str, Any]:
    path = KB_PATH if root_path is None else os.path.join(root_path, 'action_kb.yaml')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return {"platforms": {}}


# When imported, provide a convenience instance that loads the local KB
_default_generator = GuidanceGenerator()

def get_default_generator() -> GuidanceGenerator:
    return _default_generator
