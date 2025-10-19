from typing import List, Dict, Any
import re
import math
import yaml
import os
import logging

logger = logging.getLogger(__name__)
KB_PATH = os.path.join(os.path.dirname(__file__), 'action_kb.yaml')


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    text = text.lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    return tokens


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    inter = a.intersection(b)
    uni = a.union(b)
    return float(len(inter)) / float(len(uni)) if uni else 0.0


class ActionMatcher:
    def __init__(self, kb: Dict[str, Any] = None):
        if kb is None:
            try:
                with open(KB_PATH, 'r', encoding='utf-8') as f:
                    self.kb = yaml.safe_load(f)
            except Exception as e:
                logger.error(f"Failed to load KB: {e}")
                self.kb = {"platforms": {}}
        else:
            self.kb = kb

        self._index = [] 
        platforms = self.kb.get('platforms', {})
        for p_key, pdata in platforms.items():
            actions = pdata.get('actions', {})
            for a_key, adef in actions.items():
                title = adef.get('title', '')
                steps = adef.get('steps', [])
                step_msgs = []
                for s in steps:
                    if isinstance(s.get('selectors'), list):
                        for sel in s.get('selectors'):
                            if isinstance(sel, dict):
                                step_msgs.append(sel.get('message', ''))
                    step_msgs.append(s.get('message', ''))
                tokens = set(_tokenize(title + ' ' + ' '.join(step_msgs)))
                self._index.append({
                    'platform': p_key,
                    'key': a_key,
                    'id': adef.get('id', a_key),
                    'title': title,
                    'tokens': tokens,
                    'step_messages': step_msgs
                })

    def match(self, message: str, context: Dict[str, Any] = None, top_k: int = 5) -> List[Dict[str, Any]]:
        msg_tokens = set(_tokenize(message))
        results = []
        for item in self._index:
            score = _jaccard(msg_tokens, item['tokens'])
            if context and 'url' in context and item['platform'] in context['url'].lower():
                score = min(1.0, score + 0.15)
            if message.strip().lower() == item['title'].strip().lower():
                score = max(score, 0.9)
            snippet = ''
            for sm in item['step_messages']:
                if sm and any(t in _tokenize(sm) for t in msg_tokens):
                    snippet = sm
                    break
            results.append({
                'id': item['id'],
                'platform': item['platform'],
                'key': item['key'],
                'title': item['title'],
                'confidence': round(float(score), 3),
                'snippet': snippet
            })
        results = sorted(results, key=lambda x: x['confidence'], reverse=True)
        filtered = [r for r in results if r['confidence'] > 0]
        return filtered[:top_k]

_default_matcher = ActionMatcher()

def get_default_matcher() -> ActionMatcher:
    return _default_matcher
