"""
Base CRM Adapter Interface
All CRM adapters must implement this interface
"""
from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod

class CRMAdapter(ABC):
    """
    Abstract base class for CRM adapters
    Implement this for your specific CRM system
    """
    
    @abstractmethod
    async def connect(self) -> bool:
        """
        Establish connection to CRM
        Returns True if successful
        """
        pass
    
    @abstractmethod
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch employee details from CRM
        
        Args:
            employee_id: Unique employee identifier
            
        Returns:
            Dict with employee data or None if not found
            Expected keys: employee_id, name, email, role, department
        """
        pass
    
    @abstractmethod
    async def get_employee_tasks(self, employee_id: str) -> List[Dict[str, Any]]:
        """
        Fetch all onboarding tasks assigned to employee
        
        Args:
            employee_id: Unique employee identifier
            
        Returns:
            List of task dictionaries, each containing:
            - id: Unique task identifier
            - employee_id: Employee this task is assigned to
            - title: Task title
            - description: Task description
            - type: Task type (e.g., 'github_repo_creation')
            - platform: Platform where task happens (e.g., 'github.com')
            - status: Task status ('pending', 'in_progress', 'completed')
            - steps_completed: Number of steps completed
            - total_steps: Total number of steps in task
            - priority: Task priority (lower number = higher priority)
            - assigned_date: ISO format date string
        """
        pass
    
    @abstractmethod
    async def update_task_progress(
        self, 
        task_id: str, 
        employee_id: str,
        steps_completed: int, 
        status: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """
        Update task progress in CRM
        
        Args:
            task_id: Unique task identifier
            employee_id: Employee performing the task
            steps_completed: Number of steps completed
            status: New task status
            metadata: Additional metadata about the update
            
        Returns:
            True if update was successful
        """
        pass
    
    @abstractmethod
    async def log_employee_action(
        self, 
        employee_id: str, 
        action: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Log employee actions for analytics
        
        Args:
            employee_id: Employee performing action
            action: Action name/type
            metadata: Additional action data
            
        Returns:
            True if logging was successful
        """
        pass
    
    @abstractmethod
    async def create_task(
        self,
        employee_id: str,
        task_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Create a new task in CRM
        
        Args:
            employee_id: Employee to assign task to
            task_data: Task details
            
        Returns:
            Task ID if created successfully, None otherwise
        """
        pass
    
    async def disconnect(self):
        """Clean up CRM connection (optional)"""
        pass
