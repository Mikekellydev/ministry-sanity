// Local Storage Schema Management Initialization
const APP_STORAGE_KEY = 'ministry_sanity_data';

let appState = JSON.parse(localStorage.getItem(APP_STORAGE_KEY)) || {
    settings: { icalUrl: '', recurring: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] } },
    days: {},
    horizon: { monthly: [], quarterly: [], annual: [] }
};

function saveState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    renderActiveGrid();
}

// Get standard text key for localized tracking (YYYY-MM-DD)
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeekName() {
    return new Date().toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
}

// Prepare current date metrics on launch
function initDay() {
    const todayKey = getTodayKey();
    const dayName = getDayOfWeekName();
    
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', month: 'short', day: 'numeric' 
    });

    if (!appState.days[todayKey]) {
        // Hydrate baseline from recurring templates if a new calendar day is met
        const templateTasks = appState.settings.recurring[dayName] || [];
        appState.days[todayKey] = {
            vitals: { energy: 5, load: 3 },
            absolutes: templateTasks.map((t, idx) => ({ id: Date.now() + idx, text: t, done: false })),
            bandwidth: []
        };
        saveState();
    }
    renderActiveGrid();
}

// Standard Render Blocks
function renderActiveGrid() {
    const todayKey = getTodayKey();
    const currentDay = appState.days[todayKey];
    
    const absList = document.getElementById('absolutes-list');
    const bandList = document.getElementById('bandwidth-list');
    
    absList.innerHTML = '';
    bandList.innerHTML = '';

    // Render Absolutes
    currentDay.absolutes.forEach(task => {
        absList.appendChild(createTaskRow(task, 'absolutes'));
    });

    // Render Bandwidth
    currentDay.bandwidth.forEach(task => {
        bandList.appendChild(createTaskRow(task, 'bandwidth'));
    });
}

function createTaskRow(task, type) {
    const li = document.createElement('li');
    li.className = `flex items-center justify-between p-3 rounded-lg border bg-slate-900 transition ${task.done ? 'border-slate-800 opacity-50' : 'border-slate-800'}`;
    
    li.innerHTML = `
        <div class="flex items-center gap-3">
            <input type="checkbox" ${task.done ? 'checked' : ''} 
                   class="w-5 h-5 rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-0 focus:ring-offset-0"
                   onclick="toggleTaskDone(${task.id}, '${type}')">
            <span class="text-sm ${task.done ? 'line-through text-slate-500' : 'text-slate-200'}">${task.text}</span>
        </div>
    `;
    return li;
}

function promptAddTask(type) {
    const text = prompt(`Enter new ${type} requirement:`);
    if (!text) return;
    
    const todayKey = getTodayKey();
    appState.days[todayKey][type].push({
        id: Date.now(),
        text: text,
        done: false
    });
    saveState();
}

function toggleTaskDone(id, type) {
    const todayKey = getTodayKey();
    const list = appState.days[todayKey][type];
    const task = list.find(t => t.id === id);
    if (task) task.done = !task.done;
    saveState();
}

function toggleDrawer(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
}

// Bootstrap Application Runtime execution
window.onload = () => {
    initDay();
};
