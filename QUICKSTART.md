# 🚀 Quick Start Guide - ONBOARD.AI

Get up and running in 5 minutes with the Mock CRM.

---

## Step 1: Setup Backend (2 minutes)

Open PowerShell and navigate to the Backend folder:

```powershell
cd "c:\Users\sadum\OneDrive\Desktop\Helpy\Backend"
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create your `.env` file from the example:

```powershell
Copy-Item .env.example .env
```

The default `.env` is already configured for Mock CRM, so you can start immediately!

Start the backend server:

```powershell
python app.py
```

You should see:

```
INFO:     Started server process
INFO:     ✓ CRM connected successfully (mock)
INFO:     Application startup complete.
```

**Leave this terminal running** and open a new one for the next steps.

---

## Step 2: Load Chrome Extension (1 minute)

1. Open Chrome and go to: `chrome://extensions/`

2. Enable **Developer mode** (toggle in top-right corner)

3. Click **"Load unpacked"**

4. Navigate to and select the `Extension` folder:

   ```
   c:\Users\sadum\OneDrive\Desktop\Helpy\Extension
   ```

5. You should see the ONBOARD.AI extension appear

6. **Pin it to your toolbar**: Click the puzzle icon 🧩 → pin ONBOARD.AI

---

## Step 3: Test It! (2 minutes)

### Try Employee 1 (John Doe)

1. **Click the ONBOARD.AI extension icon** in your toolbar

2. **Enter Employee ID**: `emp_001`

3. **Click "Start Onboarding"**

4. **Navigate to GitHub**: [https://github.com](https://github.com)

5. You should see an **overlay banner** guiding you to create a repository!

### Try Employee 2 (Jane Smith)

Repeat the above with Employee ID: `emp_002`

---

## 🎯 What's Happening?

The **Mock CRM** has pre-loaded data:

| Employee ID | Name       | Assigned Tasks                     |
| ----------- | ---------- | ---------------------------------- |
| `emp_001`   | John Doe   | GitHub Repo Creation, GitHub Clone |
| `emp_002`   | Jane Smith | GitHub Repo Creation, GitHub Clone |

When you navigate to **github.com**, the extension:

1. Fetches your active tasks from the backend
2. Backend pulls tasks from Mock CRM
3. Shows contextual overlays guiding you through each step
4. Auto-detects progress as you complete actions
5. Syncs completion status back to the CRM

---

## 🔍 Testing the Full Workflow

### Task: Create Your First Repository

**Current Step Detection:**

1. **On GitHub homepage**: Extension shows "Click the '+' menu"

   - Auto-detects when you navigate to `/new`

2. **On `/new` page**: Extension highlights:

   - Repository name field
   - README checkbox
   - "Create repository" button
   - Auto-detects when repository is created

3. **On your new repo page**: Task marked complete! 🎉
   - Next task automatically appears

### Manual Controls

- **Click "Next ➜"** in the banner to manually advance steps
- **Click "X"** to dismiss the banner temporarily
- **Click "✓ Complete"** when task is done (auto-detected usually)

---

## 📊 View API Docs

While the backend is running, open:

[http://localhost:8000/docs](http://localhost:8000/docs)

You can test API endpoints directly from the interactive Swagger UI!

---

## 🐛 Quick Troubleshooting

### Backend won't start

**Error:** `ModuleNotFoundError: No module named 'fastapi'`

**Fix:**

```powershell
pip install -r requirements.txt
```

---

### Extension won't load

**Error:** "Failed to load extension"

**Fix:**

1. Check that you selected the `Extension` folder (not a file)
2. Refresh the extension at `chrome://extensions/`

---

### No overlays appearing

**Checklist:**

- [ ] Backend is running (check terminal)
- [ ] Employee ID entered in popup (`emp_001` or `emp_002`)
- [ ] You're on github.com
- [ ] Extension has permissions (check browser console for errors)

**Debug:**

1. Right-click on GitHub page → **Inspect** → **Console**
2. Look for messages from ONBOARD.AI
3. Check for errors (usually CORS or connection issues)

---

## 📖 Next Steps

### Connect to Real CRM

See the main [README.md](README.md) for:

- Salesforce setup
- HubSpot setup
- Custom REST API setup

Edit your `.env` file to switch CRM types!

### Add More Employees

Edit `Backend/crm/mock.py` to add more demo employees and tasks.

### Customize Task Workflows

Edit `Backend/app.py`:

- `detect_progress_from_context()` for auto-detection logic
- `generate_contextual_guidance()` for overlay messages

---

## 🎉 Success!

You now have a working employee onboarding assistant!

The system will:

- ✅ Guide employees through tasks step-by-step
- ✅ Auto-detect progress as they work
- ✅ Sync completion status back to CRM
- ✅ Queue up next tasks automatically

---

**Need help?** Check the full [README.md](README.md) for detailed documentation.
