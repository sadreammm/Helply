"""
Simple CRM REST API Server - DEMO VERSION
Includes hardcoded tasks for smooth demo flow
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import uvicorn

app = FastAPI(title="Simple CRM API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
employees: Dict[str, Dict] = {}
tasks: Dict[str, Dict] = {}
task_counter = 1

# Initialize demo data with multiple tasks
def init_demo_data():
    global task_counter
    
    # Demo employees
    employees["emp_001"] = {
        "id": "emp_001",
        "name": "John Doe",
        "email": "john@company.com",
        "role": "Software Engineer"
    }
    
    employees["emp_002"] = {
        "id": "emp_002",
        "name": "Jane Smith",
        "email": "jane@company.com",
        "role": "DevOps Engineer"
    }
    
    # Demo tasks for emp_001 - Multiple GitHub tasks for smooth demo
    tasks["task_001"] = {
        "id": "task_001",
        "employee_id": "emp_001",
        "title": "Create Your First GitHub Repository",
        "description": "Learn how to create a repository on GitHub",
        "type": "github_create_repo",
        "platform": "github.com",
        "status": "in_progress",
        "steps_completed": 0,
        "total_steps": 4,
        "priority": 1,
        "created_at": datetime.now().isoformat()
    }
    
    tasks["task_002"] = {
        "id": "task_002",
        "employee_id": "emp_001",
        "title": "Create a New File in GitHub",
        "description": "Add your first code file to the repository",
        "type": "github_create_file",
        "platform": "github.com",
        "status": "pending",
        "steps_completed": 0,
        "total_steps": 6,
        "priority": 2,
        "created_at": datetime.now().isoformat()
    }
    
    tasks["task_003"] = {
        "id": "task_003",
        "employee_id": "emp_001",
        "title": "Edit Your README File",
        "description": "Customize your project's README",
        "type": "github_edit_readme",
        "platform": "github.com",
        "status": "pending",
        "steps_completed": 0,
        "total_steps": 7,
        "priority": 3,
        "created_at": datetime.now().isoformat()
    }
    
    tasks["task_004"] = {
        "id": "task_004",
        "employee_id": "emp_001",
        "title": "Create a GitHub Issue",
        "description": "Learn how to track bugs and features",
        "type": "github_create_issue",
        "platform": "github.com",
        "status": "pending",
        "steps_completed": 0,
        "total_steps": 5,
        "priority": 4,
        "created_at": datetime.now().isoformat()
    }
    
    tasks["task_005"] = {
        "id": "task_005",
        "employee_id": "emp_001",
        "title": "Fork a Repository",
        "description": "Make your own copy of a project",
        "type": "github_fork",
        "platform": "github.com",
        "status": "pending",
        "steps_completed": 0,
        "total_steps": 3,
        "priority": 5,
        "created_at": datetime.now().isoformat()
    }
    
    # Tasks for emp_002
    tasks["task_006"] = {
        "id": "task_006",
        "employee_id": "emp_002",
        "title": "Create Your First GitHub Repository",
        "description": "Learn how to create a repository on GitHub",
        "type": "github_create_repo",
        "platform": "github.com",
        "status": "pending",
        "steps_completed": 0,
        "total_steps": 4,
        "priority": 1,
        "created_at": datetime.now().isoformat()
    }
    
    task_counter = 7
    print("✓ Demo data initialized (2 employees, 6 tasks - GitHub only)")

init_demo_data()

# Models
class Employee(BaseModel):
    id: str
    name: str
    email: str
    role: str

class Task(BaseModel):
    id: Optional[str] = None
    employee_id: str
    title: str
    description: str = ""
    type: str
    platform: str
    status: str = "pending"
    steps_completed: int = 0
    total_steps: int = 1
    priority: int = 99

# ============= ENDPOINTS =============

@app.get("/")
def root():
    return {
        "message": "Simple CRM API - DEMO VERSION",
        "version": "1.0.0",
        "employees": len(employees),
        "tasks": len(tasks)
    }

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# ===== EMPLOYEE ENDPOINTS =====

@app.get("/api/employees/{employee_id}")
def get_employee(employee_id: str):
    """Get employee by ID"""
    if employee_id not in employees:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employees[employee_id]

@app.get("/api/employees")
def list_employees():
    """List all employees"""
    return {"employees": list(employees.values())}

@app.post("/api/employees")
def create_employee(employee: Employee):
    """Create new employee"""
    if employee.id in employees:
        raise HTTPException(status_code=400, detail="Employee already exists")
    
    employees[employee.id] = employee.dict()
    return employees[employee.id]

# ===== TASK ENDPOINTS =====

@app.get("/api/employees/{employee_id}/tasks")
def get_employee_tasks(employee_id: str, status: Optional[str] = None):
    """Get all tasks for an employee"""
    if employee_id not in employees:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Filter tasks by employee
    employee_tasks = [
        task for task in tasks.values()
        if task["employee_id"] == employee_id
    ]
    
    # Filter by status if provided
    if status:
        status_list = [s.strip() for s in status.split(",")]
        employee_tasks = [
            task for task in employee_tasks
            if task["status"] in status_list
        ]
    
    # Sort by priority
    employee_tasks.sort(key=lambda x: (x["status"] != "in_progress", x["priority"]))
    
    return employee_tasks

@app.post("/api/tasks")
def create_task(task: Task):
    """Create a new task"""
    global task_counter
    
    if task.employee_id not in employees:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Generate task ID
    task_id = f"task_{task_counter:03d}"
    task_counter += 1
    
    task_data = task.dict()
    task_data["id"] = task_id
    task_data["created_at"] = datetime.now().isoformat()
    
    tasks[task_id] = task_data
    
    print(f"✓ Task created: {task_id} - {task.title}")
    
    return {"id": task_id, "task": task_data}

@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    """Get a specific task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, update_data: Dict):
    """Update a task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update task fields
    for key, value in update_data.items():
        if key in tasks[task_id]:
            tasks[task_id][key] = value
    
    tasks[task_id]["updated_at"] = datetime.now().isoformat()
    
    print(f"✓ Task updated: {task_id} - {update_data}")
    
    return tasks[task_id]

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    """Delete a task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    deleted_task = tasks.pop(task_id)
    
    print(f"✓ Task deleted: {task_id} - {deleted_task['title']}")
    
    return {"status": "deleted", "task_id": task_id}

# ===== ANALYTICS ENDPOINTS =====

@app.post("/api/analytics/actions")
def log_action(action_data: Dict):
    """Log employee actions"""
    print(f"[ANALYTICS] {action_data.get('employee_id')}: {action_data.get('action')} - {action_data.get('metadata')}")
    return {"status": "logged"}

@app.get("/api/tasks")
def list_all_tasks(status: Optional[str] = None):
    """List all tasks"""
    all_tasks = list(tasks.values())
    
    if status:
        status_list = [s.strip() for s in status.split(",")]
        all_tasks = [task for task in all_tasks if task["status"] in status_list]
    
    return {"tasks": all_tasks}

# ===== UTILITY ENDPOINTS =====

@app.post("/api/reset")
def reset_data():
    """Reset to demo data"""
    global employees, tasks, task_counter
    employees.clear()
    tasks.clear()
    task_counter = 1
    init_demo_data()
    return {"status": "reset", "message": "Demo data reloaded"}

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Starting Simple CRM API Server - DEMO VERSION")
    print("=" * 60)
    print("Server: http://localhost:3000")
    print("API Docs: http://localhost:3000/docs")
    print("Health: http://localhost:3000/api/health")
    print("\n📋 Demo Tasks Loaded:")
    print("  - Create GitHub Repository (4 steps)")
    print("  - Create a New File (6 steps)")
    print("  - Edit README File (7 steps)")
    print("  - Create a New Branch (3 steps)")
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=3000, log_level="info")