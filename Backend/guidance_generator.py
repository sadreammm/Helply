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
        """
        platforms = self.kb.get('platforms', {})
        if platform in platforms:
            actions = platforms[platform].get('actions', {})
            # action_id could be key or id field; try both
            if action_id in actions:
                return actions[action_id]
            # fallback: match by id property
            for k, v in actions.items():
                if v.get('id') == action_id:
                    return v
        # try matching by id across all platforms
        for p, pdata in platforms.items():
            for k, v in pdata.get('actions', {}).items():
                if v.get('id') == action_id:
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
