# ONBOARD.AI - Dynamic CRM-Powered Employee Onboarding Assistant

A Chrome extension + FastAPI backend system that provides interactive, overlay-based guidance for employee onboarding tasks. Tasks are dynamically pulled from your CRM system, and completion status is synced back in real-time.

## 🌟 Features

- **Dynamic Task Loading**: Pulls onboarding tasks from CRM systems (Salesforce, HubSpot, or custom REST APIs)
- **Smart Auto-Progression**: Detects user progress automatically based on page context
- **Interactive Overlays**: Visual step-by-step guidance with highlights, tooltips, and animations
- **Bidirectional CRM Sync**: Task completion status updates back to your CRM in real-time
- **Multi-CRM Support**: Pluggable adapter architecture supports multiple CRM platforms
- **GitHub Onboarding**: Pre-built workflows for GitHub repository creation, cloning, and pull requests

---

## 📁 Project Structure

```
Helpy/
├── Backend/                # FastAPI backend server
│   ├── app.py             # Main application with auto-progress detection
│   ├── config.py          # Configuration management
│   ├── .env               # Environment variables (create from .env.example)
│   ├── .env.example       # Environment template
│   ├── requirements.txt   # Python dependencies
│   └── crm/               # CRM adapter modules
│       ├── __init__.py    # Module exports
│       ├── base.py        # Abstract CRM adapter base class
│       ├── mock.py        # Mock CRM for testing
│       ├── salesforce.py  # Salesforce CRM adapter
│       ├── hubspot.py     # HubSpot CRM adapter
│       ├── generic_rest.py# Generic REST API adapter
│       └── factory.py     # CRM adapter factory
│
└── Extension/             # Chrome extension files
    ├── manifest.json      # Extension configuration
    ├── content.js         # Injected overlay UI
    ├── background.js      # Service worker
    ├── popup.html         # Extension popup UI
    └── popup.js           # Popup logic
```

---

## 🚀 Quick Start

### 1. Backend Setup

#### Install Dependencies

```powershell
cd Backend
pip install -r requirements.txt
```

#### Start the Backend

```powershell
python app.py
```

The API will be available at `http://localhost:8000`

You can view the API docs at: `http://localhost:8000/docs`

---

### 2. Chrome Extension Setup

1. **Open Chrome** and navigate to `chrome://extensions/`

2. **Enable Developer Mode** (toggle in top right)

3. **Click "Load unpacked"**

4. **Select the `Extension` folder** from this project

5. **Pin the extension** to your toolbar (puzzle icon → pin ONBOARD.AI)

6. **Navigate to GitHub** - the extension will automatically detect tasks and show guidance

---

## ⚙️ CRM Configuration

### Option 1: Mock CRM (Default - For Testing)

Perfect for testing without a real CRM connection.

```env
CRM_TYPE=mock
```

The mock CRM includes demo data with 2 employees (`emp_001`, `emp_002`) and GitHub onboarding tasks.

---

### Option 2: Salesforce

#### Prerequisites

1. Salesforce account with API access
2. Create custom objects in Salesforce:
   - `Employee__c`
   - `Onboarding_Task__c`

#### Salesforce Setup

**Create Custom Object: Employee\_\_c**

Fields:

- `Name` (Auto Number) - Employee ID
- `Email__c` (Email)
- `Role__c` (Text)
- `Employee_Name__c` (Text)

**Create Custom Object: Onboarding_Task\_\_c**

Fields:

- `Name` (Auto Number) - Task ID
- `Employee__c` (Lookup to Employee\_\_c)
- `Title__c` (Text, 255)
- `Description__c` (Long Text Area)
- `Type__c` (Picklist: github_repo_creation, github_clone, github_pull_request)
- `Platform__c` (Text, 100) - e.g., "github.com"
- `Status__c` (Picklist: assigned, in_progress, completed, cancelled)
- `Steps_Completed__c` (Number, 2 decimal places)
- `Total_Steps__c` (Number, 0 decimal places)
- `Priority__c` (Number, 0 decimal places)
- `Assigned_Date__c` (Date/Time)
- `Last_Updated__c` (Date/Time)

#### Configuration

```env
CRM_TYPE=salesforce
SALESFORCE_USERNAME=your_username@company.com
SALESFORCE_PASSWORD=your_password
SALESFORCE_SECURITY_TOKEN=your_security_token
SALESFORCE_DOMAIN=login  # or 'test' for sandbox
```

#### Getting Your Security Token

1. Log into Salesforce
2. Click your profile icon → Settings
3. My Personal Information → Reset My Security Token
4. Check your email for the token

---

### Option 3: HubSpot

#### Prerequisites

1. HubSpot account with API access
2. Create custom object for onboarding tasks

#### HubSpot Setup

**Create Custom Object: onboarding_tasks**

Properties:

- `title` (Single-line text)
- `description` (Multi-line text)
- `type` (Single-line text) - github_repo_creation, github_clone, etc.
- `platform` (Single-line text) - github.com
- `status` (Dropdown: assigned, in_progress, completed)
- `steps_completed` (Number)
- `total_steps` (Number)
- `priority` (Number)
- `employee_id` (Single-line text) - Link to contact

**Associate with Contacts**

Create an association between `Contacts` and `onboarding_tasks`.

#### Configuration

```env
CRM_TYPE=hubspot
HUBSPOT_API_KEY=your_api_key        # For API key auth
# OR
HUBSPOT_ACCESS_TOKEN=your_token     # For OAuth
```

#### Getting HubSpot API Credentials

**Option A: Private App (Recommended)**

1. Settings → Integrations → Private Apps
2. Create a new private app
3. Grant scopes: `crm.objects.contacts.read`, `crm.objects.custom.read`, `crm.objects.custom.write`
4. Copy the Access Token

**Option B: API Key (Legacy)**

1. Settings → Integrations → API Key
2. Generate or view API key

---

### Option 4: Generic REST API

Use this for custom CRM systems with REST APIs.

#### Configuration

```env
CRM_TYPE=generic_rest
CRM_API_BASE_URL=https://your-crm.com/api/v1
CRM_API_KEY=your_api_key
CRM_API_SECRET=your_api_secret  # Optional
```

#### API Endpoints Required

Your REST API should implement these endpoints:

**GET** `/employees/{employee_id}`

```json
{
  "name": "John Doe",
  "email": "john@company.com",
  "role": "Software Engineer"
}
```

**GET** `/employees/{employee_id}/tasks`

```json
[
  {
    "id": "task_001",
    "title": "Create GitHub Repository",
    "description": "...",
    "type": "github_repo_creation",
    "platform": "github.com",
    "status": "in_progress",
    "steps_completed": 1,
    "total_steps": 3,
    "priority": 1
  }
]
```

**PUT** `/tasks/{task_id}/progress`

```json
{
  "employee_id": "emp_001",
  "steps_completed": 2,
  "status": "in_progress"
}
```

**POST** `/employees/{employee_id}/actions`

```json
{
  "action": "repository_created",
  "metadata": { "url": "..." }
}
```

---

## 🎯 Usage

### For Employees

1. **Log into the system** with your employee ID (e.g., `emp_001`)
2. **Navigate to GitHub** (or whatever platform your task requires)
3. **Follow the visual guidance** - overlays will highlight exactly what to click
4. **Click "Next ➜"** manually or let auto-progression detect your progress
5. **Complete the task** - status syncs back to your CRM automatically

### For Administrators

#### Adding New Employees

Add employees directly in your CRM system. The backend will automatically pull new employee data.

#### Creating Onboarding Tasks

Create tasks in your CRM with these required fields:

- **employee_id**: Link to employee record
- **title**: Task name (e.g., "Create Your First Repository")
- **description**: Detailed instructions
- **type**: Task workflow type (see [Task Types](#task-types))
- **platform**: Website domain (e.g., "github.com")
- **status**: `assigned`, `in_progress`, `completed`, or `cancelled`
- **steps_completed**: Current progress (0 to total_steps)
- **total_steps**: Total steps in workflow
- **priority**: Display order (1 = highest)

#### Task Types

Built-in task types:

| Type                   | Platform   | Description             |
| ---------------------- | ---------- | ----------------------- |
| `github_repo_creation` | github.com | Create a new repository |
| `github_clone`         | github.com | Clone a repository      |
| `github_pull_request`  | github.com | Create a pull request   |

To add custom task types, extend the `detect_progress_from_context()` and `generate_contextual_guidance()` functions in `Backend/app.py`.

---

## 📊 API Reference

### Core Endpoints

#### `POST /api/employee/task`

Get active task for employee on current URL.

**Request:**

```json
{
  "employee_id": "emp_001",
  "current_url": "https://github.com"
}
```

**Response:**

```json
{
  "has_active_task": true,
  "employee": {
    "id": "emp_001",
    "name": "John Doe",
    "role": "Software Engineer"
  },
  "task": {
    "id": "task_001",
    "title": "Create Your First GitHub Repository",
    "type": "github_repo_creation",
    "platform": "github.com",
    "status": "in_progress",
    "steps_completed": 1,
    "total_steps": 3,
    "priority": 1
  }
}
```

---

#### `POST /api/guidance`

Get contextual overlay guidance for current page.

**Request:**

```json
{
  "url": "https://github.com/new",
  "page_title": "Create a new repository",
  "visible_text": "Repository name...",
  "dom_elements": ["input#repository_name", "button.btn-primary"],
  "employee_id": "emp_001",
  "task_id": "task_001"
}
```

**Response:**

```json
{
  "actions": [
    {
      "target_selector": "input#repository_name",
      "action_type": "highlight",
      "message": "📝 Enter 'my-first-project' as your repository name",
      "position": "bottom",
      "animation": "pulse"
    }
  ],
  "tip": "💡 Pro tip: Always add a README!",
  "step_number": 2,
  "total_steps": 3,
  "task_complete": false
}
```

---

#### `POST /api/task/progress`

Manually advance task progress (when user clicks "Next ➜").

**Request:**

```json
{
  "employee_id": "emp_001",
  "task_id": "task_001",
  "step_completed": 2,
  "action_taken": "manual_next_step"
}
```

**Response:**

```json
{
  "status": "success",
  "message": "Progress updated in CRM",
  "steps_completed": 2,
  "task_status": "in_progress"
}
```

---

## 🔧 Customization

### Adding New Task Workflows

1. **Add task type to your CRM** with appropriate metadata

2. **Extend auto-detection** in `Backend/app.py`:

```python
async def detect_progress_from_context(context, task, employee_id):
    # Add your custom task type detection
    if task_type == "your_custom_task":
        if current_step == 0 and "your_condition" in url:
            await crm.update_task_progress(task['id'], employee_id, 1, 'in_progress')
            return True
```

3. **Add guidance generation** in `Backend/app.py`:

```python
def generate_contextual_guidance(context, task):
    if task['type'] == "your_custom_task":
        if step_number == 1:
            actions = [
                OverlayAction(
                    target_selector=".your-button",
                    action_type="highlight",
                    message="Click here to proceed",
                    position="bottom"
                )
            ]
```

### Creating New CRM Adapters

Implement the `CRMAdapter` abstract base class in `Backend/crm/base.py`:

```python
from crm.base import CRMAdapter

class MyCRMAdapter(CRMAdapter):
    async def connect(self) -> bool:
        # Initialize connection
        pass

    async def get_employee(self, employee_id: str):
        # Fetch employee data
        pass

    async def get_employee_tasks(self, employee_id: str):
        # Fetch tasks
        pass

    async def update_task_progress(self, task_id, employee_id,
                                   steps_completed, status, metadata=None):
        # Update progress in CRM
        pass
```

Register in `Backend/crm/factory.py`.

---

## 🐛 Troubleshooting

### Extension Not Loading

**Error:** "Failed to load extension"

**Solution:**

- Check `manifest.json` for syntax errors
- Ensure all referenced files exist
- Reload the extension after changes

---

### Backend Not Connecting to CRM

**Error:** "CRM connection failed"

**Solution:**

- Verify credentials in `.env`
- Check CRM API access permissions
- Review logs: Look for connection error details in terminal
- Test with `CRM_TYPE=mock` first

---

### Tasks Not Appearing

**Checklist:**

1. Employee exists in CRM with correct ID
2. Tasks are assigned with `status=assigned` or `status=in_progress`
3. Task `platform` field matches current URL (e.g., "github.com")
4. Backend is running (`python app.py`)
5. Extension has permissions for the website

---

### Auto-Progress Not Working

**Checklist:**

1. Page context is being sent (check Network tab in DevTools)
2. URL patterns match in `detect_progress_from_context()`
3. DOM elements are accessible (check `context.dom_elements`)
4. Task type has auto-detection logic implemented

---

## 📚 Development

### Running in Development Mode

**Backend:**

```powershell
cd Backend
python app.py  # Runs with auto-reload if DEBUG=true in .env
```

**Extension:**

- Make changes to files in `Extension/`
- Go to `chrome://extensions/`
- Click refresh icon on ONBOARD.AI card

### Viewing Logs

**Backend Logs:**
Terminal output shows:

- CRM connection status
- API requests
- Auto-progression events
- Employee actions

**Extension Logs:**

- Right-click extension icon → "Inspect popup" → Console
- On GitHub: Right-click page → Inspect → Console (content script logs)
- `chrome://extensions/` → ONBOARD.AI → "Inspect views: service worker" (background logs)

---

## 🏗️ Architecture

### Auto-Progression Flow

```
User on GitHub Page
     ↓
Content Script Sends Context
     ↓
Backend Analyzes Page (URL, DOM, visible text)
     ↓
detect_progress_from_context()
     ↓
Match Task Type + Current Step
     ↓
Update CRM Progress ← Bidirectional Sync
     ↓
Return Updated Guidance
     ↓
Extension Shows Next Step
```

### CRM Sync Pattern

```
                  ┌─────────────┐
                  │     CRM     │
                  │  (Source of │
                  │    Truth)   │
                  └──────┬──────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
      ⬇️ PULL                         ⬆️ PUSH
   get_employee()              update_task_progress()
   get_employee_tasks()        log_employee_action()
          │                             │
    ┌─────▼─────────────────────────────▼─────┐
    │       FastAPI Backend (app.py)          │
    │   Auto-detection + Guidance Generation  │
    └─────┬─────────────────────────────┬─────┘
          │                             │
      📤 API Response              📥 Page Context
          │                             │
    ┌─────▼─────────────────────────────▼─────┐
    │   Chrome Extension (content.js)         │
    │   Overlay UI + User Interactions        │
    └─────────────────────────────────────────┘
```

---

## 📝 License

MIT License - feel free to use and modify for your organization.

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

- [ ] Additional task workflow templates
- [ ] More CRM adapters (Workday, BambooHR, etc.)
- [ ] Offline mode with local caching
- [ ] Analytics dashboard
- [ ] Mobile support
- [ ] Multi-language support

---

## 📞 Support

For issues, questions, or feature requests:

1. Check [Troubleshooting](#troubleshooting) section
2. Review API logs and browser console
3. Test with `CRM_TYPE=mock` to isolate issues

---

## 🔒 Security Notes

- **Never commit `.env`** - it contains sensitive credentials
- **Use HTTPS** in production (backend should use SSL certificate)
- **Validate employee IDs** - implement authentication in production
- **Sanitize CRM data** - don't trust external data without validation
- **Limit API access** - use CORS and authentication middleware

---

**Built with ❤️ for better employee onboarding experiences**
