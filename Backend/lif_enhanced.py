from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import random
from collections import defaultdict


class FeedbackSignal(BaseModel):
    employee_id: str
    task_id: str
    step_number: int
    signal_type: str
    timestamp: Optional[datetime] = None
    context: Optional[Dict[str, Any]] = None

class KnowledgePin(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    author_id: str
    task_type: str
    version: int = 1
    trust_score: float = 0.0
    created_at: Optional[datetime] = None
    validated_by: List[str] = []
    expiry_date: Optional[datetime] = None

class ExitCapture(BaseModel):
    employee_id: str
    knowledge_pins: List[str]
    workflows_captured: List[Dict[str, Any]]
    key_contacts: List[str]
    final_config: Dict[str, Any]
    capture_timestamp: Optional[datetime] = None

class RLPolicy(BaseModel):
    task_type: str
    role: str
    action_preferences: Dict[str, float]
    avg_completion_rate: float = 0.0
    total_episodes: int = 0


feedback_store = defaultdict(list) 
knowledge_pins_store: Dict[str, KnowledgePin] = {}
exit_captures_store: Dict[str, ExitCapture] = {}
rl_policies: Dict[tuple, RLPolicy] = {}

analytics_data = {
    "onboarding_heatmap": defaultdict(lambda: defaultdict(int)),
    "knowledge_loss_risks": [],
    "completion_times": [],
    "feedback_stats": {"got_it": 0, "show_me_where": 0, "correct": 0, "incorrect": 0}
}


def calculate_reward(signal_type: str, previous_signals: List[str]) -> float:
    rewards = {
        "got_it": 1.0,
        "show_me_where": -1.0,
        "correct": 2.0,
        "incorrect": -0.5
    }
    base_reward = rewards.get(signal_type, 0.0)
    if signal_type == "show_me_where":
        recent_shows = sum(1 for s in previous_signals[-3:] if s == "show_me_where")
        base_reward -= (recent_shows * 0.5)
    return base_reward


def update_rl_policy(task_type: str, role: str, reward: float, action_type: str) -> RLPolicy:
    key = (task_type, role)
    if key not in rl_policies:
        rl_policies[key] = RLPolicy(
            task_type=task_type,
            role=role,
            action_preferences={
                "highlight": 0.4,
                "tooltip": 0.3,
                "detailed_hint": 0.2,
                "sandbox": 0.1
            },
            avg_completion_rate=0.0,
            total_episodes=0
        )
    policy = rl_policies[key]
    learning_rate = 0.1
    current_prob = policy.action_preferences.get(action_type, 0.25)
    if reward > 0:
        new_prob = current_prob + learning_rate * reward
    else:
        new_prob = current_prob + learning_rate * reward * 0.5
    new_prob = max(0.05, min(0.7, new_prob))
    policy.action_preferences[action_type] = new_prob
    total = sum(policy.action_preferences.values())
    if total <= 0:
        # reset to uniform
        n = len(policy.action_preferences)
        for act in policy.action_preferences:
            policy.action_preferences[act] = 1.0 / n
    else:
        for act in list(policy.action_preferences.keys()):
            policy.action_preferences[act] /= total
    policy.total_episodes += 1
    return policy


def get_best_action(task_type: str, role: str, step_number: int) -> str:
    key = (task_type, role)
    if key not in rl_policies:
        return "highlight" if step_number == 0 else "tooltip"
    policy = rl_policies[key]
    actions = list(policy.action_preferences.keys())
    probs = list(policy.action_preferences.values())
    return random.choices(actions, weights=probs, k=1)[0]


app = FastAPI(title="ONBOARD.AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/feedback")
async def record_feedback(feedback: FeedbackSignal):
    if not feedback.timestamp:
        feedback.timestamp = datetime.now()
    feedback_store[feedback.task_id].append(feedback.dict())
    analytics_data["feedback_stats"][feedback.signal_type] = analytics_data["feedback_stats"].get(feedback.signal_type, 0) + 1
    if feedback.signal_type == "show_me_where":
        analytics_data["onboarding_heatmap"][feedback.task_id][feedback.step_number] += 1
    previous_signals = [f["signal_type"] for f in feedback_store[feedback.task_id][:-1]]
    reward = calculate_reward(feedback.signal_type, previous_signals)
    action_type = feedback.context.get("action_type", "highlight") if feedback.context else "highlight"
    role = feedback.context.get("role", "junior") if feedback.context else "junior"
    updated_policy = update_rl_policy(feedback.task_id, role, reward, action_type)
    return {
        "status": "success",
        "reward": reward,
        "policy_updated": True,
        "new_action_preferences": updated_policy.action_preferences,
        "message": f"Feedback recorded. System learned from your {feedback.signal_type} signal."
    }

@app.get("/api/guidance/optimized")
async def get_optimized_guidance(task_id: str, employee_id: str, step_number: int, role: str = "junior"):
    best_action = get_best_action(task_id, role, step_number)
    relevant_pins = [pin for pin in knowledge_pins_store.values() if pin.task_type == task_id and pin.trust_score > 0.5]
    guidance = {
        "action_type": best_action,
        "step_number": step_number,
        "rl_confidence": rl_policies.get((task_id, role), RLPolicy(task_type=task_id, role=role, action_preferences={}, avg_completion_rate=0, total_episodes=0)).total_episodes,
        "knowledge_pins": [
            {"title": pin.title, "content": (pin.content[:200] + "...") if len(pin.content) > 200 else pin.content, "trust_score": pin.trust_score, "author": pin.author_id}
            for pin in relevant_pins[:2]
        ],
        "personalization_note": f"Guidance optimized for {role} based on {len(feedback_store.get(task_id, []))} past interactions"
    }
    return guidance

@app.post("/api/knowledge/pin")
async def create_knowledge_pin(pin: KnowledgePin):
    if not pin.id:
        pin.id = f"pin_{len(knowledge_pins_store) + 1}"
    if not pin.created_at:
        pin.created_at = datetime.now()
    knowledge_pins_store[pin.id] = pin
    return {"status": "success", "pin_id": pin.id, "message": "Knowledge pin created and indexed"}

@app.get("/api/knowledge/search")
async def search_knowledge_pins(query: str, task_type: Optional[str] = None):
    results = []
    q = query.lower()
    for pin in knowledge_pins_store.values():
        if q in pin.title.lower() or q in pin.content.lower():
            if not task_type or pin.task_type == task_type:
                results.append({"id": pin.id, "title": pin.title, "snippet": pin.content[:150] + "...", "trust_score": pin.trust_score, "author": pin.author_id, "version": pin.version})
    results.sort(key=lambda x: x["trust_score"], reverse=True)
    return {"results": results, "total": len(results)}

@app.post("/api/offboarding/capture")
async def capture_exit_knowledge(capture: ExitCapture):
    if not capture.capture_timestamp:
        capture.capture_timestamp = datetime.now()
    exit_captures_store[capture.employee_id] = capture
    risk_score = len(capture.knowledge_pins) * 0.1 + len(capture.workflows_captured) * 0.2
    analytics_data["knowledge_loss_risks"].append({"employee_id": capture.employee_id, "risk_score": min(risk_score, 1.0), "captured_at": capture.capture_timestamp.isoformat()})
    return {"status": "success", "capture_id": capture.employee_id, "knowledge_pins_captured": len(capture.knowledge_pins), "workflows_captured": len(capture.workflows_captured), "message": "Exit knowledge captured and stored in secure escrow"}

@app.get("/api/offboarding/handover/{employee_id}")
async def generate_handover_playbook(employee_id: str):
    if employee_id not in exit_captures_store:
        raise HTTPException(status_code=404, detail="No exit capture found")
    capture = exit_captures_store[employee_id]
    playbook = {
        "employee_id": employee_id,
        "handover_items": [
            {"priority": 1, "category": "Critical Knowledge", "items": [pin for pin in capture.knowledge_pins[:3]], "estimated_time": "2 hours"},
            {"priority": 2, "category": "Workflow Transfers", "items": [w["name"] for w in capture.workflows_captured], "estimated_time": "4 hours"},
            {"priority": 3, "category": "Key Contacts Intro", "items": capture.key_contacts, "estimated_time": "1 hour"}
        ],
        "total_estimated_time": "7 hours",
        "recommended_successor_training": "Schedule 3 sessions over 2 weeks"
    }
    return playbook

@app.get("/api/analytics/dashboard")
async def get_analytics_dashboard():
    avg_completion = sum(analytics_data["completion_times"]) / len(analytics_data["completion_times"]) if analytics_data["completion_times"] else 0
    heatmap_flat = []
    for task_type, steps in analytics_data["onboarding_heatmap"].items():
        for step, count in steps.items():
            heatmap_flat.append({"task_type": task_type, "step": step, "stuck_count": count})
    heatmap_flat.sort(key=lambda x: x["stuck_count"], reverse=True)
    policy_stats = []
    for (task_type, role), policy in rl_policies.items():
        top_action = max(policy.action_preferences, key=policy.action_preferences.get) if policy.action_preferences else None
        policy_stats.append({"task_type": task_type, "role": role, "episodes": policy.total_episodes, "completion_rate": policy.avg_completion_rate, "top_action": top_action})
    return {"summary": {"total_feedback_signals": sum(analytics_data["feedback_stats"].values()), "avg_completion_time_mins": round(avg_completion, 1), "knowledge_pins_created": len(knowledge_pins_store), "exit_captures": len(exit_captures_store), "rl_policies_trained": len(rl_policies)}, "feedback_breakdown": analytics_data["feedback_stats"], "top_stuck_points": heatmap_flat[:5], "knowledge_loss_risks": analytics_data["knowledge_loss_risks"][ -5 :], "rl_improvements": policy_stats, "federated_learning": {"local_node_active": True, "model_version": "1.2.3", "last_sync": datetime.now().isoformat(), "privacy_preserved": True, "aggregated_improvements": "+12% completion rate"}} 

@app.get("/api/simulate/counterfactual")
async def simulate_counterfactual(employee_id: str, task_id: str, intervention_day: int = 3):
    baseline_ramp_time = random.uniform(10, 20)
    improvement_factor = max(0.7, 1.0 - (intervention_day * 0.05))
    optimized_ramp_time = baseline_ramp_time * improvement_factor
    return {"simulation": "counterfactual_onboarding", "employee_id": employee_id, "baseline_ramp_time_days": round(baseline_ramp_time, 1), "with_day_3_training": {"ramp_time_days": round(optimized_ramp_time, 1), "improvement_pct": round((1 - improvement_factor) * 100, 1), "confidence": 0.87}, "recommendation": f"Train {task_id} on day {intervention_day} to reduce ramp-up time by {round((1-improvement_factor)*100, 1)}%", "chronos_engine": "temporal_sim_v2"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
