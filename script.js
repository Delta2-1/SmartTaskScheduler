/**
 * ==========================================
 * MOCK SDK (Simulates the missing SDK files)
 * ==========================================
 * This allows the app to work locally using LocalStorage
 */
if (!window.dataSdk || !window.elementSdk) {
    console.log("SDKs not found. Initializing LocalStorage Mock SDK...");

    // 1. Mock the Element SDK (Configuration/UI)
    window.elementSdk = {
        config: null,
        init: async ({ defaultConfig, onConfigChange }) => {
            window.elementSdk.config = defaultConfig;
            // Trigger the config change immediately so styles apply
            onConfigChange(defaultConfig);
            return { isOk: true };
        },
        setConfig: (newConfig) => {
            Object.assign(window.elementSdk.config, newConfig);
        }
    };

    // 2. Mock the Data SDK (Saving/Loading Tasks)
    window.dataSdk = {
        _handler: null,
        // Load from LocalStorage or start empty
        _data: JSON.parse(localStorage.getItem('my_tasks') || '[]'),
        
        init: async (handler) => {
            window.dataSdk._handler = handler;
            // Trigger initial load of data
            handler.onDataChanged(window.dataSdk._data);
            return { isOk: true };
        },
        
        create: async (item) => {
            window.dataSdk._data.push(item);
            localStorage.setItem('my_tasks', JSON.stringify(window.dataSdk._data));
            window.dataSdk._handler.onDataChanged(window.dataSdk._data);
            return { isOk: true };
        },
        
        update: async (item) => {
            const index = window.dataSdk._data.findIndex(t => t.id === item.id);
            if (index !== -1) {
                window.dataSdk._data[index] = item;
                localStorage.setItem('my_tasks', JSON.stringify(window.dataSdk._data));
                window.dataSdk._handler.onDataChanged(window.dataSdk._data);
            }
            return { isOk: true };
        }
    };
}

/**
 * ==========================================
 * MAIN APP LOGIC
 * ==========================================
 */

const defaultConfig = {
    app_title: "Smart Task Prioritizer",
    welcome_message: "Organize your tasks intelligently",
    add_task_button: "Add Task",
    complete_button: "Complete",
    background_color: "#667eea",
    surface_color: "#ffffff",
    text_color: "#333333",
    primary_action_color: "#667eea",
    secondary_action_color: "#764ba2",
    font_family: "sans-serif",
    font_size: 16
};

let tasks = [];
let isDarkMode = false;
let editingTaskId = null;
let aiSuggestions = [];

// This handles sorting tasks when data changes
const dataHandler = {
    onDataChanged(data) {
        tasks = data.sort((a, b) => {
            const priorityOrder = { immediate: 0, important: 1, least: 2 };
            const pA = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 3;
            const pB = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 3;
            return pA - pB;
        });
        renderTasks();
    }
};

async function initializeApp() {
    // Initialize Data (Virtual)
    const initResult = await window.dataSdk.init(dataHandler);
    if (!initResult.isOk) {
        console.error("Failed to initialize data SDK");
    }

    // Initialize UI Configuration
    await window.elementSdk.init({
        defaultConfig,
        onConfigChange: async (config) => {
            window.elementSdk.config = config; 
            
            const customFont = config.font_family || defaultConfig.font_family;
            const baseFontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
            const baseSize = parseInt(config.font_size || defaultConfig.font_size);

            document.body.style.fontFamily = `${customFont}, ${baseFontStack}`;
            document.getElementById('headerTitle').textContent = config.app_title || defaultConfig.app_title;
            document.getElementById('addTaskBtn').textContent = config.add_task_button || defaultConfig.add_task_button;
            document.getElementById('headerTitle').style.fontSize = `${baseSize * 1.5}px`;
            
            updateDynamicStyles(config, isDarkMode);
            renderTasks();
        },
        // Capabilities and mappings are kept for structure but unused in local version
        mapToCapabilities: (config) => ({}),
        mapToEditPanelValues: (config) => new Map([
            ["app_title", config.app_title || defaultConfig.app_title]
        ])
    });
}

function updateDynamicStyles(config, darkMode) {
    const bgColor = config.background_color || defaultConfig.background_color;
    const primaryColor = config.primary_action_color || defaultConfig.primary_action_color;
    const secondaryColor = config.secondary_action_color || defaultConfig.secondary_action_color;

    const appContainer = document.getElementById('appContainer');
    
    // Apply gradient background
    appContainer.style.background = `linear-gradient(135deg, ${bgColor} 0%, ${secondaryColor} 100%)`;

    // Update button gradients
    const buttons = document.querySelectorAll('.add-task-btn, .complete-btn');
    buttons.forEach(btn => {
        btn.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
    });
}

function calculatePriority(title, description, deadline) {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const daysUntilDeadline = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    const urgentKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'now'];
    const importantKeywords = ['important', 'meeting', 'deadline', 'exam', 'presentation', 'project'];

    const text = (title + ' ' + (description || '')).toLowerCase();
    const hasUrgentKeyword = urgentKeywords.some(keyword => text.includes(keyword));
    const hasImportantKeyword = importantKeywords.some(keyword => text.includes(keyword));

    if (daysUntilDeadline <= 2 || hasUrgentKeyword) {
        return 'immediate';
    } else if (daysUntilDeadline <= 7 || hasImportantKeyword) {
        return 'important';
    } else {
        return 'least';
    }
}

function generateAISuggestions() {
    if (tasks.length < 1) return [];

    const suggestions = [];
    const incompleteTasks = tasks.filter(t => !t.completed);
    
    // Suggestion 1: If many tasks are incomplete
    if (incompleteTasks.length > 2) {
        suggestions.push({
            id: `ai-${Date.now()}-1`,
            title: 'Review pending tasks',
            description: `You have ${incompleteTasks.length} pending tasks.`,
            deadline: getTomorrowDate(),
            isAI: true
        });
    }

    // Suggestion 2: Weekly Review (Mock)
    if (tasks.length > 5) {
        suggestions.push({
            id: `ai-${Date.now()}-2`,
            title: 'Weekly Progress Check',
            description: `Review your completed tasks for the week.`,
            deadline: getNextWeekDate(),
            isAI: true
        });
    }

    return suggestions;
}

function getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
}

function getNextWeekDate() {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
}

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    const config = (window.elementSdk && window.elementSdk.config) || defaultConfig;

    aiSuggestions = generateAISuggestions();

    if (tasks.length === 0 && aiSuggestions.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">No tasks yet. Add your first task to get started!</div>
          </div>
        `;
        return;
    }

    let html = '';

    if (tasks.length >= 999) {
        html += `
          <div class="limit-warning">
            ⚠️ Maximum limit of 999 tasks reached. Please complete some tasks first.
          </div>
        `;
    }

    // Render AI Suggestions
    if (aiSuggestions.length > 0) {
        html += `
          <div class="ai-suggestions">
            <div class="ai-header">
              <span class="ai-header-icon">🤖</span>
              <span>Smart Suggestions</span>
            </div>
        `;

        aiSuggestions.forEach(suggestion => {
            html += `
            <div class="suggestion-item">
              <div class="suggestion-text">${suggestion.title}</div>
              <button class="add-suggestion-btn" onclick="addSuggestion('${suggestion.id}')">Add Task</button>
            </div>
          `;
        });

        html += `</div>`;
    }

    const now = new Date();

    tasks.forEach(task => {
        const isEditing = editingTaskId === task.id;
        const priorityLabel = task.priority === 'immediate' ? 'Immediate Action' :
            task.priority === 'important' ? 'Important' : 'Least Important';

        const deadline = new Date(task.deadline);
        // Skip if deadline is invalid
        if (isNaN(deadline.getTime())) return;

        const isOverdue = deadline < now && !task.completed;
        const formattedDate = deadline.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        if (isEditing) {
            html += `
            <div class="task-item ${task.priority} edit-mode" data-task-id="${task.id}">
              <input type="text" class="task-input" id="edit-title-${task.id}" value="${task.title}" style="margin-bottom: 10px;">
              <textarea class="task-input task-description" id="edit-desc-${task.id}" style="margin-bottom: 10px;">${task.description}</textarea>
              <input type="date" class="task-input" id="edit-deadline-${task.id}" value="${task.deadline}" style="margin-bottom: 10px;">
              <div class="edit-actions">
                <button class="save-btn" onclick="saveTask('${task.id}')">Save Changes</button>
                <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
              </div>
            </div>
          `;
        } else {
            html += `
            <div class="task-item ${task.priority} ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
              ${isOverdue ? '<div class="overdue-badge">⚠️ OVERDUE</div>' : ''}
              <div class="task-header">
                <div class="task-title">${task.title}</div>
                <div class="priority-badge ${task.priority}">${priorityLabel}</div>
              </div>
              <div class="task-description-text">${task.description}</div>
              <div class="task-footer">
                <div class="task-deadline">📅 ${formattedDate}</div>
                <div class="task-actions">
                  <button class="edit-btn" onclick="editTask('${task.id}')" ${task.completed ? 'disabled' : ''}>
                    ✏️ Edit
                  </button>
                  <button class="complete-btn" onclick="completeTask('${task.id}')" ${task.completed ? 'disabled' : ''}>
                    ${task.completed ? '✓ Completed' : (config.complete_button || defaultConfig.complete_button)}
                  </button>
                </div>
              </div>
            </div>
          `;
        }
    });

    container.innerHTML = html;
}

/**
 * INITIALIZATION & EVENT LISTENERS
 */
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();

    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        const container = document.getElementById('appContainer');
        const toggle = document.getElementById('themeToggle');
        const config = (window.elementSdk && window.elementSdk.config) || defaultConfig;

        if (isDarkMode) {
            container.classList.remove('light');
            container.classList.add('dark');
            toggle.textContent = '☀️';
        } else {
            container.classList.remove('dark');
            container.classList.add('light');
            toggle.textContent = '🌙';
        }
        updateDynamicStyles(config, isDarkMode);
    });

    // Logout / Reset Button
    document.getElementById('logoutButton').addEventListener('click', () => {
        if(confirm("This will clear all tasks and reset the app. Are you sure?")) {
            localStorage.removeItem('my_tasks');
            location.reload();
        }
    });

    // Add Task Button
    document.getElementById('addTaskBtn').addEventListener('click', async () => {
        if (tasks.length >= 999) return;

        const titleInput = document.getElementById('taskTitle');
        const descInput = document.getElementById('taskDescription');
        const deadlineInput = document.getElementById('taskDeadline');

        const title = titleInput.value.trim();
        const description = descInput.value.trim();
        const deadline = deadlineInput.value;

        if (!title || !deadline) {
            alert("Please enter a title and a deadline.");
            return;
        }

        const btn = document.getElementById('addTaskBtn');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        const priority = calculatePriority(title, description, deadline);

        const newTask = {
            id: Date.now().toString(),
            title,
            description,
            deadline,
            priority,
            completed: false,
            createdAt: new Date().toISOString()
        };

        const result = await window.dataSdk.create(newTask);

        if (result.isOk) {
            titleInput.value = '';
            descInput.value = '';
            deadlineInput.value = '';
        }

        btn.disabled = false;
        const config = (window.elementSdk && window.elementSdk.config) || defaultConfig;
        btn.textContent = config.add_task_button || defaultConfig.add_task_button;
    });
});

// Global functions needed for inline HTML onclick events
window.completeTask = async function (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const btn = document.querySelector(`[data-task-id="${taskId}"] .complete-btn`);
    if(btn) {
        btn.disabled = true;
        btn.textContent = 'Completing...';
    }

    const updatedTask = { ...task, completed: true };
    await window.dataSdk.update(updatedTask);
};

window.editTask = function (taskId) {
    editingTaskId = taskId;
    renderTasks();
};

window.cancelEdit = function () {
    editingTaskId = null;
    renderTasks();
};

window.saveTask = async function (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const title = document.getElementById(`edit-title-${taskId}`).value.trim();
    const description = document.getElementById(`edit-desc-${taskId}`).value.trim();
    const deadline = document.getElementById(`edit-deadline-${taskId}`).value;

    if (!title || !deadline) return;

    const priority = calculatePriority(title, description, deadline);
    const updatedTask = { ...task, title, description, deadline, priority };

    const result = await window.dataSdk.update(updatedTask);

    if (result.isOk) {
        editingTaskId = null;
    }
};

window.addSuggestion = async function (suggestionId) {
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Adding...';

    const priority = calculatePriority(suggestion.title, suggestion.description, suggestion.deadline);

    const newTask = {
        id: Date.now().toString(),
        title: suggestion.title,
        description: suggestion.description,
        deadline: suggestion.deadline,
        priority,
        completed: false,
        createdAt: new Date().toISOString()
    };

    await window.dataSdk.create(newTask);
};