"""
Generic REST API CRM Adapter
Works with any REST API that follows standard patterns
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
import requests
from .base import CRMAdapter

class GenericRESTCRMAdapter(CRMAdapter):
    """
    Generic REST API adapter for custom CRM systems
    
    Configure your API endpoints in .env:
    - CRM_API_BASE_URL: Base URL of your API
    - CRM_API_KEY: API key for authentication
    - CRM_API_SECRET: API secret (if needed)
    
    Customize the endpoint paths and data mapping for your API
    """
    
    def __init__(self, base_url: str, api_key: str, api_secret: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.api_secret = api_secret
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        })
    
    async def connect(self) -> bool:
        """Test API connection"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            return response.status_code == 200
        except Exception as e:
            print(f"API connection failed: {e}")
            return False
    
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch employee from your API
        Customize endpoint and response mapping
        """
        try:
            response = self.session.get(f"{self.base_url}/employees/{employee_id}")
            
            if response.status_code == 200:
                data = response.json()
                # Map your API response to standard format
                return {
                    "employee_id": data.get("id"),
                    "name": data.get("name") or f"{data.get('first_name')} {data.get('last_name')}",
                    "email": data.get("email"),
                    "role": data.get("role") or data.get("job_title"),
                    "department": data.get("department")
                }
            return None
        except Exception as e:
            print(f"Error fetching employee: {e}")
            return None
    
    async def get_employee_tasks(self, employee_id: str) -> List[Dict[str, Any]]:
        """
        Fetch tasks from your API
        Customize endpoint and response mapping
        """
        try:
            response = self.session.get(
                f"{self.base_url}/employees/{employee_id}/tasks",
                params={"status": "pending,in_progress"}
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            tasks_list = data if isinstance(data, list) else data.get("tasks", [])
            
            tasks = []
            for item in tasks_list:
                # Map your API response to standard format
                tasks.append({
                    "id": item.get("id") or item.get("task_id"),
                    "employee_id": employee_id,
                    "title": item.get("title") or item.get("name"),
                    "description": item.get("description"),
                    "type": item.get("type") or item.get("task_type"),
                    "platform": item.get("platform"),
                    "status": item.get("status", "pending").lower(),
                    "steps_completed": int(item.get("steps_completed", 0)),
                    "total_steps": int(item.get("total_steps", 1)),
                    "priority": int(item.get("priority", 99)),
                    "assigned_date": item.get("assigned_date") or item.get("created_at")
                })
            
            return sorted(tasks, key=lambda x: (x['status'] != 'in_progress', x['priority']))
        except Exception as e:
            print(f"Error fetching tasks: {e}")
            return []
    
    async def update_task_progress(
        self, 
        task_id: str, 
        employee_id: str,
        steps_completed: int, 
        status: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """Update task via your API"""
        try:
            payload = {
                "steps_completed": steps_completed,
                "status": status,
                "updated_at": datetime.now().isoformat()
            }
            
            if metadata:
                payload["metadata"] = metadata
            
            response = self.session.patch(
                f"{self.base_url}/tasks/{task_id}",
                json=payload
            )
            
            if response.status_code in [200, 204]:
                await self.log_employee_action(employee_id, "task_updated", {
                    "task_id": task_id,
                    "steps_completed": steps_completed,
                    "status": status
                })
                return True
            
            return False
        except Exception as e:
            print(f"Error updating task: {e}")
            return False
    
    async def log_employee_action(
        self, 
        employee_id: str, 
        action: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """Log action to your API"""
        try:
            payload = {
                "employee_id": employee_id,
                "action": action,
                "timestamp": datetime.now().isoformat(),
                "metadata": metadata
            }
            
            response = self.session.post(
                f"{self.base_url}/analytics/actions",
                json=payload
            )
            
            return response.status_code in [200, 201]
        except Exception as e:
            print(f"Error logging action: {e}")
            return False
    
    async def create_task(
        self,
        employee_id: str,
        task_data: Dict[str, Any]
    ) -> Optional[str]:
        """Create new task via your API"""
        try:
            payload = {
                "employee_id": employee_id,
                "title": task_data.get("title"),
                "description": task_data.get("description"),
                "type": task_data.get("type"),
                "platform": task_data.get("platform"),
                "status": "pending",
                "steps_completed": 0,
                "total_steps": task_data.get("total_steps", 1),
                "priority": task_data.get("priority", 99),
                "assigned_date": datetime.now().date().isoformat()
            }
            
            response = self.session.post(
                f"{self.base_url}/tasks",
                json=payload
            )
            
            if response.status_code in [200, 201]:
                result = response.json()
                return result.get("id") or result.get("task_id")
            
            return None
        except Exception as e:
            print(f"Error creating task: {e}")
            return None
