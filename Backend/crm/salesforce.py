"""
Salesforce CRM Adapter
Connects to Salesforce to manage employee onboarding tasks
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from .base import CRMAdapter

try:
    from simple_salesforce import Salesforce
    SALESFORCE_AVAILABLE = True
except ImportError:
    SALESFORCE_AVAILABLE = False

class SalesforceCRMAdapter(CRMAdapter):
    """
    Salesforce CRM Adapter
    
    Required Salesforce Objects:
    - Employee__c: Custom object for employees
    - Onboarding_Task__c: Custom object for onboarding tasks
    
    Setup Instructions:
    1. Create custom objects in Salesforce
    2. Set up field mappings
    3. Configure API access
    4. Add credentials to .env file
    """
    
    def __init__(self, username: str, password: str, security_token: str, domain: str = "login"):
        if not SALESFORCE_AVAILABLE:
            raise ImportError("simple-salesforce not installed. Run: pip install simple-salesforce")
        
        self.username = username
        self.password = password
        self.security_token = security_token
        self.domain = domain
        self.sf: Optional[Salesforce] = None
    
    async def connect(self) -> bool:
        """Connect to Salesforce"""
        try:
            self.sf = Salesforce(
                username=self.username,
                password=self.password,
                security_token=self.security_token,
                domain=self.domain
            )
            return True
        except Exception as e:
            print(f"Salesforce connection failed: {e}")
            return False
    
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch employee from Salesforce Employee__c object
        Adjust field names to match your Salesforce schema
        """
        if not self.sf:
            await self.connect()
        
        try:
            # Query employee by external ID or custom field
            query = f"""
                SELECT Id, Name, Email__c, Role__c, Department__c, Employee_External_Id__c
                FROM Employee__c
                WHERE Employee_External_Id__c = '{employee_id}'
                LIMIT 1
            """
            result = self.sf.query(query)
            
            if result['totalSize'] > 0:
                emp = result['records'][0]
                return {
                    "employee_id": emp.get('Employee_External_Id__c'),
                    "salesforce_id": emp['Id'],
                    "name": emp.get('Name'),
                    "email": emp.get('Email__c'),
                    "role": emp.get('Role__c'),
                    "department": emp.get('Department__c')
                }
            return None
        except Exception as e:
            print(f"Error fetching employee: {e}")
            return None
    
    async def get_employee_tasks(self, employee_id: str) -> List[Dict[str, Any]]:
        """
        Fetch onboarding tasks from Salesforce
        Adjust field names to match your Salesforce schema
        """
        if not self.sf:
            await self.connect()
        
        try:
            # First get employee Salesforce ID
            employee = await self.get_employee(employee_id)
            if not employee:
                return []
            
            sf_employee_id = employee['salesforce_id']
            
            # Query tasks
            query = f"""
                SELECT Id, Name, Description__c, Type__c, Platform__c,
                       Status__c, Steps_Completed__c, Total_Steps__c,
                       Priority__c, Assigned_Date__c
                FROM Onboarding_Task__c
                WHERE Employee__c = '{sf_employee_id}'
                ORDER BY Priority__c ASC
            """
            result = self.sf.query(query)
            
            tasks = []
            for record in result['records']:
                tasks.append({
                    "id": record['Id'],
                    "employee_id": employee_id,
                    "title": record.get('Name'),
                    "description": record.get('Description__c'),
                    "type": record.get('Type__c'),
                    "platform": record.get('Platform__c'),
                    "status": record.get('Status__c', 'pending').lower(),
                    "steps_completed": int(record.get('Steps_Completed__c', 0)),
                    "total_steps": int(record.get('Total_Steps__c', 1)),
                    "priority": int(record.get('Priority__c', 99)),
                    "assigned_date": record.get('Assigned_Date__c')
                })
            
            return tasks
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
        """Update task in Salesforce"""
        if not self.sf:
            await self.connect()
        
        try:
            # Update Onboarding_Task__c record
            update_data = {
                'Steps_Completed__c': steps_completed,
                'Status__c': status.title(),  # Salesforce picklist values are usually title case
                'Last_Updated__c': datetime.now().isoformat()
            }
            
            if metadata:
                # Store metadata as JSON in a text field if available
                import json
                update_data['Metadata__c'] = json.dumps(metadata)
            
            self.sf.Onboarding_Task__c.update(task_id, update_data)
            
            # Log the action
            await self.log_employee_action(employee_id, "task_updated", {
                "task_id": task_id,
                "steps_completed": steps_completed,
                "status": status
            })
            
            return True
        except Exception as e:
            print(f"Error updating task: {e}")
            return False
    
    async def log_employee_action(
        self, 
        employee_id: str, 
        action: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Log action to Salesforce Activity History or custom log object
        """
        if not self.sf:
            await self.connect()
        
        try:
            # Get employee Salesforce ID
            employee = await self.get_employee(employee_id)
            if not employee:
                return False
            
            # Create activity or log record
            # Adjust to your Salesforce schema
            log_data = {
                'Employee__c': employee['salesforce_id'],
                'Action__c': action,
                'Timestamp__c': datetime.now().isoformat(),
                'Details__c': str(metadata)
            }
            
            # Uncomment if you have a custom Activity_Log__c object
            # self.sf.Activity_Log__c.create(log_data)
            
            return True
        except Exception as e:
            print(f"Error logging action: {e}")
            return False
    
    async def create_task(
        self,
        employee_id: str,
        task_data: Dict[str, Any]
    ) -> Optional[str]:
        """Create new task in Salesforce"""
        if not self.sf:
            await self.connect()
        
        try:
            employee = await self.get_employee(employee_id)
            if not employee:
                return None
            
            sf_task_data = {
                'Employee__c': employee['salesforce_id'],
                'Name': task_data.get('title'),
                'Description__c': task_data.get('description'),
                'Type__c': task_data.get('type'),
                'Platform__c': task_data.get('platform'),
                'Status__c': 'Pending',
                'Steps_Completed__c': 0,
                'Total_Steps__c': task_data.get('total_steps', 1),
                'Priority__c': task_data.get('priority', 99),
                'Assigned_Date__c': datetime.now().date().isoformat()
            }
            
            result = self.sf.Onboarding_Task__c.create(sf_task_data)
            return result['id']
        except Exception as e:
            print(f"Error creating task: {e}")
            return None
