"""
Mock CRM Adapter for Testing
Replace with real CRM adapter in production
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from .base import CRMAdapter

class MockCRMAdapter(CRMAdapter):
    """Mock CRM for testing - simulates a real CRM"""
    
    def __init__(self):
        self.employees: Dict[str, Dict] = {}
        self.tasks: Dict[str, List[Dict]] = {}
        self.action_log: List[Dict] = []
        self._init_demo_data()
    
    def _init_demo_data(self):
        """Initialize with demo data"""
        
        # Task templates
        task_templates = {
            "github_repo_creation": {
                "title": "Create Your First GitHub Repository",
                "description": "Navigate to GitHub and create a new repository",
                "type": "github_repo_creation",
                "platform": "github.com",
                "total_steps": 3,
            },
            "github_clone": {
                "title": "Clone a Repository",
                "description": "Clone a repository to your local machine",
                "type": "github_clone",
                "platform": "github.com",
                "total_steps": 3,
            },
            "github_pull_request": {
                "title": "Create Your First Pull Request",
                "description": "Make a change and create a pull request",
                "type": "github_pull_request",
                "platform": "github.com",
                "total_steps": 4,
            },
        }
        
        # Demo employees
        demo_employees = {
            "emp_001": {
                "employee_id": "emp_001",
                "name": "John Doe",
                "email": "john@company.com",
                "role": "Software Engineer",
                "department": "Engineering"
            },
            "emp_002": {
                "employee_id": "emp_002",
                "name": "Jane Smith",
                "email": "jane@company.com",
                "role": "DevOps Engineer",
                "department": "Engineering"
            },
        }
        
        # Assign tasks
        for emp_id, emp_data in demo_employees.items():
            self.employees[emp_id] = emp_data
            self.tasks[emp_id] = [
                {
                    "id": f"task_{emp_id}_001",
                    "employee_id": emp_id,
                    **task_templates["github_repo_creation"],
                    "status": "in_progress",
                    "steps_completed": 0,
                    "assigned_date": datetime.now().isoformat(),
                    "priority": 1
                },
                {
                    "id": f"task_{emp_id}_002",
                    "employee_id": emp_id,
                    **task_templates["github_clone"],
                    "status": "pending",
                    "steps_completed": 0,
                    "assigned_date": datetime.now().isoformat(),
                    "priority": 2
                },
                {
                    "id": f"task_{emp_id}_003",
                    "employee_id": emp_id,
                    **task_templates["github_pull_request"],
                    "status": "pending",
                    "steps_completed": 0,
                    "assigned_date": datetime.now().isoformat(),
                    "priority": 3
                }
            ]
    
    async def connect(self) -> bool:
        """Mock connect always succeeds"""
        return True
    
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        return self.employees.get(employee_id)
    
    async def get_employee_tasks(self, employee_id: str) -> List[Dict[str, Any]]:
        tasks = self.tasks.get(employee_id, [])
        # Sort by status (in_progress first) then priority
        return sorted(tasks, key=lambda x: (x['status'] != 'in_progress', x['priority']))
    
    async def update_task_progress(
        self, 
        task_id: str, 
        employee_id: str,
        steps_completed: int, 
        status: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        tasks = self.tasks.get(employee_id, [])
        for task in tasks:
            if task['id'] == task_id:
                task['steps_completed'] = steps_completed
                task['status'] = status
                task['last_updated'] = datetime.now().isoformat()
                if metadata:
                    task['metadata'] = metadata
                
                # Log the update
                await self.log_employee_action(
                    employee_id,
                    "task_progress_updated",
                    {
                        "task_id": task_id,
                        "steps_completed": steps_completed,
                        "status": status,
                        **(metadata or {})
                    }
                )
                return True
        return False
    
    async def log_employee_action(
        self, 
        employee_id: str, 
        action: str,
        metadata: Dict[str, Any]
    ) -> bool:
        log_entry = {
            "employee_id": employee_id,
            "action": action,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata
        }
        self.action_log.append(log_entry)
        print(f"[MOCK CRM LOG] {employee_id}: {action} - {metadata}")
        return True
    
    async def create_task(
        self,
        employee_id: str,
        task_data: Dict[str, Any]
    ) -> Optional[str]:
        """Create a new task"""
        task_id = f"task_{employee_id}_{len(self.tasks.get(employee_id, [])) + 1:03d}"
        
        new_task = {
            "id": task_id,
            "employee_id": employee_id,
            "assigned_date": datetime.now().isoformat(),
            "status": "pending",
            "steps_completed": 0,
            **task_data
        }
        
        if employee_id not in self.tasks:
            self.tasks[employee_id] = []
        
        self.tasks[employee_id].append(new_task)
        return task_id
