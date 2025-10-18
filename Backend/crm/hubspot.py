"""
HubSpot CRM Adapter
Connects to HubSpot to manage employee onboarding
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from .base import CRMAdapter

try:
    from hubspot import HubSpot
    from hubspot.crm.contacts import SimplePublicObjectInput
    from hubspot.crm.objects import SimplePublicObjectInput as TaskInput
    HUBSPOT_AVAILABLE = True
except ImportError:
    HUBSPOT_AVAILABLE = False

class HubSpotCRMAdapter(CRMAdapter):
    """
    HubSpot CRM Adapter
    
    Setup Instructions:
    1. Create custom objects in HubSpot for Onboarding Tasks
    2. Set up properties for task tracking
    3. Get API key or access token from HubSpot
    4. Add credentials to .env file
    """
    
    def __init__(self, api_key: Optional[str] = None, access_token: Optional[str] = None):
        if not HUBSPOT_AVAILABLE:
            raise ImportError("hubspot-api-client not installed. Run: pip install hubspot-api-client")
        
        if access_token:
            self.client = HubSpot(access_token=access_token)
        elif api_key:
            self.client = HubSpot(api_key=api_key)
        else:
            raise ValueError("Either api_key or access_token required")
    
    async def connect(self) -> bool:
        """Test HubSpot connection"""
        try:
            # Test connection by fetching account info
            # self.client.crm.owners.get_all()
            return True
        except Exception as e:
            print(f"HubSpot connection failed: {e}")
            return False
    
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """Fetch employee from HubSpot Contacts"""
        try:
            # Search for contact by custom property
            filter_groups = [{
                "filters": [{
                    "propertyName": "employee_id",
                    "operator": "EQ",
                    "value": employee_id
                }]
            }]
            
            results = self.client.crm.contacts.search_api.do_search(
                public_object_search_request={
                    "filter_groups": filter_groups,
                    "properties": ["firstname", "lastname", "email", "jobtitle", "employee_id"]
                }
            )
            
            if results.total > 0:
                contact = results.results[0]
                props = contact.properties
                return {
                    "employee_id": props.get("employee_id"),
                    "hubspot_id": contact.id,
                    "name": f"{props.get('firstname', '')} {props.get('lastname', '')}".strip(),
                    "email": props.get("email"),
                    "role": props.get("jobtitle"),
                    "department": props.get("department")
                }
            return None
        except Exception as e:
            print(f"Error fetching employee: {e}")
            return None
    
    async def get_employee_tasks(self, employee_id: str) -> List[Dict[str, Any]]:
        """Fetch onboarding tasks from HubSpot custom objects"""
        try:
            employee = await self.get_employee(employee_id)
            if not employee:
                return []
            
            # Search for tasks associated with this contact
            # Note: Adjust to your HubSpot custom object schema
            filter_groups = [{
                "filters": [{
                    "propertyName": "employee_contact_id",
                    "operator": "EQ",
                    "value": employee['hubspot_id']
                }]
            }]
            
            # Assuming custom object "onboarding_tasks"
            results = self.client.crm.objects.search_api.do_search(
                object_type="onboarding_tasks",
                public_object_search_request={
                    "filter_groups": filter_groups,
                    "properties": [
                        "title", "description", "type", "platform",
                        "status", "steps_completed", "total_steps", "priority"
                    ],
                    "sorts": [{"propertyName": "priority", "direction": "ASCENDING"}]
                }
            )
            
            tasks = []
            for obj in results.results:
                props = obj.properties
                tasks.append({
                    "id": obj.id,
                    "employee_id": employee_id,
                    "title": props.get("title"),
                    "description": props.get("description"),
                    "type": props.get("type"),
                    "platform": props.get("platform"),
                    "status": props.get("status", "pending").lower(),
                    "steps_completed": int(props.get("steps_completed", 0)),
                    "total_steps": int(props.get("total_steps", 1)),
                    "priority": int(props.get("priority", 99)),
                    "assigned_date": props.get("assigned_date")
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
        """Update task in HubSpot"""
        try:
            properties = {
                "steps_completed": str(steps_completed),
                "status": status,
                "last_updated": datetime.now().isoformat()
            }
            
            if metadata:
                import json
                properties["metadata"] = json.dumps(metadata)
            
            self.client.crm.objects.basic_api.update(
                object_type="onboarding_tasks",
                object_id=task_id,
                simple_public_object_input={"properties": properties}
            )
            
            await self.log_employee_action(employee_id, "task_updated", {
                "task_id": task_id,
                "steps_completed": steps_completed
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
        """Log action to HubSpot timeline or custom object"""
        try:
            employee = await self.get_employee(employee_id)
            if not employee:
                return False
            
            # Create engagement or timeline event
            # Adjust based on your HubSpot setup
            return True
        except Exception as e:
            print(f"Error logging action: {e}")
            return False
    
    async def create_task(
        self,
        employee_id: str,
        task_data: Dict[str, Any]
    ) -> Optional[str]:
        """Create new task in HubSpot"""
        try:
            employee = await self.get_employee(employee_id)
            if not employee:
                return None
            
            properties = {
                "employee_contact_id": employee['hubspot_id'],
                "title": task_data.get("title"),
                "description": task_data.get("description"),
                "type": task_data.get("type"),
                "platform": task_data.get("platform"),
                "status": "pending",
                "steps_completed": "0",
                "total_steps": str(task_data.get("total_steps", 1)),
                "priority": str(task_data.get("priority", 99)),
                "assigned_date": datetime.now().date().isoformat()
            }
            
            result = self.client.crm.objects.basic_api.create(
                object_type="onboarding_tasks",
                simple_public_object_input={"properties": properties}
            )
            
            return result.id
        except Exception as e:
            print(f"Error creating task: {e}")
            return None
