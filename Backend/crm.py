
from typing import List, Optional, Dict, Any
from datetime import datetime
import requests
import logging

logger = logging.getLogger(__name__)


class CRM:
   
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        })
    
    async def connect(self) -> bool:
        try:
            response = self.session.get(f"{self.base_url}/health")
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"API connection test failed: {e}")
            return True 
    
    async def get_employee(self, employee_id: str) -> Optional[Dict]:
        try:
            response = self.session.get(f"{self.base_url}/employees/{employee_id}")
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "id": employee_id,
                    "name": data.get("name", "Unknown"),
                    "email": data.get("email", ""),
                    "role": data.get("role", "Employee")
                }
            return {"id": employee_id, "name": "Unknown", "email": "", "role": "Employee"}
        except Exception as e:
            logger.error(f"Error fetching employee: {e}")
            return {"id": employee_id, "name": "Unknown", "email": "", "role": "Employee"}
    
    async def get_tasks(self, employee_id: str) -> List[Dict]:
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
                task = {
                    "id": item.get("id"),
                    "employee_id": employee_id,
                    "title": item.get("title"),
                    "description": item.get("description", ""),
                    "type": item.get("type"),
                    "platform": item.get("platform"),
                    "status": item.get("status", "pending"),
                    "steps_completed": int(item.get("steps_completed", 0)),
                    "total_steps": int(item.get("total_steps", 1)),
                    "priority": int(item.get("priority", 99))
                }
                tasks.append(task)
            
            return sorted(tasks, key=lambda x: (x['status'] != 'in_progress', x['priority']))
        
        except Exception as e:
            logger.error(f"Error fetching tasks: {e}")
            return []
    
    async def create_task(self, employee_id: str, task: Dict) -> Optional[str]:
        try:
            payload = {
                "employee_id": employee_id,
                "title": task.get("title"),
                "description": task.get("description", ""),
                "type": task.get("type"),
                "platform": task.get("platform"),
                "status": "pending",
                "steps_completed": 0,
                "total_steps": task.get("total_steps", 1),
                "priority": task.get("priority", 99),
                "created_at": datetime.now().isoformat()
            }
            
            response = self.session.post(
                f"{self.base_url}/tasks",
                json=payload
            )
            
            if response.status_code in [200, 201]:
                result = response.json()
                task_id = result.get("id") or result.get("task_id")
                logger.info(f"✓ Task created: {task_id}")
                return task_id
            
            logger.error(f"Failed to create task: {response.status_code}")
            return None
        
        except Exception as e:
            logger.error(f"Error creating task: {e}")
            return None
    
    async def update_task(self, task_id: str, employee_id: str, 
                         steps_completed: int, status: str) -> bool:
        try:
            if status == 'completed':
                return await self.delete_task(task_id, employee_id)
            payload = {
                "steps_completed": steps_completed,
                "status": status,
                "updated_at": datetime.now().isoformat()
            }
            
            response = self.session.patch(
                f"{self.base_url}/tasks/{task_id}",
                json=payload
            )
            
            return response.status_code in [200, 204]
        
        except Exception as e:
            logger.error(f"Error updating task: {e}")
            return False
    
    async def delete_task(self, task_id: str, employee_id: str) -> bool:
        try:
            await self.log_action(employee_id, "task_completed", {"task_id": task_id})
            
            response = self.session.delete(f"{self.base_url}/tasks/{task_id}")
            
            if response.status_code in [200, 204]:
                logger.info(f"Task deleted: {task_id}")
                return True
            
            logger.warning(f"Failed to delete task: {response.status_code}")
            return False
        
        except Exception as e:
            logger.error(f"Error deleting task: {e}")
            return False
    
    async def log_action(self, employee_id: str, action: str, metadata: Dict) -> bool:
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
            logger.debug(f"Analytics logging failed: {e}")
            return False
    
    async def disconnect(self):
        self.session.close()


def get_crm(base_url: str, api_key: str) -> CRM:
    return CRM(base_url, api_key)
