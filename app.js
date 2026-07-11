const APP_STORAGE_KEY = 'ministry_sanity_data_v2';

// Baseline state structural initialization
let appState = JSON.parse(localStorage.getItem(APP_STORAGE_KEY)) || {
    settings: { icalUrl: '', recurring: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [] } },
    days: {},
    horizon: { monthly: [], quarterly: [], annual: [] }
};

let activeHorizonTab = 'monthly';

function saveState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    renderActiveGrid();
    renderFutureDrawer();
}

// Global UI State Toggle Utility
function toggleDrawer(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden');
        if (id === 'settings-drawer' && !el.classList.contains('hidden')) {
            populateSettingsInputs();
        }
    }
}

// Generate matching key syntax (YYYY-MM-DD)
function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeekName() {
    return new Date().toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
}

// Initial Run: Check day structure and pull calendar feed
function initDay() {
    const todayKey = getTodayKey();
    const dayName = getDayOfWeekName();
    
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', month: 'short', day: 'numeric' 
    });

    // If day hasn't been instantiated yet, inject template
    if (!appState.days[todayKey]) {
        const templateTasks = appState.settings.recurring[dayName] || [];
        appState.days[todayKey] = {
            absolutes: templateTasks.map((text, idx) => ({ id: Date.now() + idx, text: text, done: false })),
            bandwidth: []
        };
        saveState();
    }
    
    renderActiveGrid();
    renderFutureDrawer();
    
    // Trigger Live Calendar Fetch if a URL exists
    if (appState.settings.icalUrl) {
        fetchCalendarFeed(appState.settings.icalUrl);
    }
}

// --- iCAL PARSING ENGINE ---
async function fetchCalendarFeed(url) {
    const eventContainer = document.getElementById('calendar-events');
    eventContainer.innerHTML = `<p class="italic text-teal-500 animate-pulse">Syncing agenda...</p>`;

    try {
        // Cleaning standard web-version feed strings if pasted directly from Google/Outlook
        let targetUrl = url.replace('webcal://', 'https://');
        
        // Routing through an open CORS proxy so the browser can read the file directly
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Network proxy failed.");
        
        const data = await response.json();
        const jcalData = ICAL.parse(data.contents);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        const todayStr = getTodayKey(); // YYYY-MM-DD
        let todayEvents = [];

        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            const dtstart = event.startDate.toJSDate();
            
            // Format event start date to match our key lookup local format
            const eventDateStr = `${dtstart.getFullYear()}-${String(dtstart.getMonth() + 1).padStart(2, '0')}-${String(dtstart.getDate()).padStart(2, '0')}`;
            
            if (eventDateStr === todayStr) {
                let timeStr = "All Day";
                if (!event.startDate.isDate) { // Check if it's not a full-day block item
                    timeStr = dtstart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                todayEvents.push({ time: timeStr, summary: event.summary, rawTime: dtstart.getTime() });
            }
        });

        // Sort events chronologically
        todayEvents.sort((a, b) => a.rawTime - b.rawTime);

        // Render to Header Display Block
        if (todayEvents.length === 0) {
            eventContainer.innerHTML = `<p class="italic text-slate-500">No scheduled meetings today. Clear runway.</p>`;
        } else {
            eventContainer.innerHTML = todayEvents.map(e => `
                <div class="flex items-start gap-2 py-0.5">
                    <span class="text-teal-400 font-mono font-medium shrink-0 w-16">${e.time}</span>
                    <span class="text-slate-200 truncate">${e.summary}</span>
                </div>
            `).join('');
        }

    } catch (error) {
        console.error("Calendar Sync Error:", error);
        eventContainer.innerHTML = `<p class="italic text-rose-500">⚠️ Calendar sync failed. Check feed URL config.</p>`;
    }
}

// UI Active Render Layer
function renderActiveGrid() {
    const todayKey = getTodayKey();
    const currentDay = appState.days[todayKey] || { absolutes: [], bandwidth: [] };
    
    const absList = document.getElementById('absolutes-list');
    const bandList = document.getElementById('bandwidth-list');
    
    absList.innerHTML = '';
    bandList.innerHTML = '';

    if (currentDay.absolutes.length === 0) {
        absList.innerHTML = `<li class="text-slate-600 text-xs italic p-2 text-center">No structural requirements set.</li>`;
    } else {
        currentDay.absolutes.forEach(task => absList.appendChild(createTaskRow(task, 'absolutes')));
    }

    if (currentDay.bandwidth.length === 0) {
        bandList.innerHTML = `<li class="text-slate-600 text-xs italic p-4 text-center">Bandwidth is empty. Logging live interruptions as they appear.</li>`;
    } else {
        currentDay.bandwidth.forEach(task => bandList.appendChild(createTaskRow(task, 'bandwidth')));
    }
}

function createTaskRow(task, type) {
    const li = document.createElement('li');
    li.className = `flex items-center justify-between p-3 rounded-lg border bg-slate-900 transition ${task.done ? 'border-slate-950 opacity-40 bg-slate-950' : 'border-slate-800'}`;
    
    li.innerHTML = `
        <div class="flex items-center gap-3">
            <input type="checkbox" ${task.done ? 'checked' : ''} 
                   class="w-5 h-5 rounded border-slate-700 bg-slate-800 text-teal-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                   onclick="toggleTaskDone(${task.id}, '${type}')">
            <span class="text-sm ${task.done ? 'line-through text-slate-500' : 'text-slate-200'}">${task.text}</span>
        </div>
        <button onclick="deleteTask(${task.id}, '${type}')" class="text-slate-600 hover:text-rose-400 px-2 text-xs">✕</button>
    `;
    return li;
}

// Interactive Data Management Operations
function promptAddTask(type) {
    const text = prompt(`Enter new ${type} assignment:`);
    if (!text || text.trim() === '') return;
    
    const todayKey = getTodayKey();
    appState.days[todayKey][type].push({ id: Date.now(), text: text.trim(), done: false });
    saveState();
}

function toggleTaskDone(id, type) {
    const todayKey = getTodayKey();
    const task = appState.days[todayKey][type].find(t => t.id === id);
    if (task) task.done = !task.done;
    saveState();
}

function deleteTask(id, type) {
    const todayKey = getTodayKey();
    appState.days[todayKey][type] = appState.days[todayKey][type].filter(t => t.id !== id);
    saveState();
}

// System Configurations Configuration Functions
function populateSettingsInputs() {
    document.getElementById('settings-ical-input').value = appState.settings.icalUrl || '';
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    days.forEach(day => {
        document.getElementById(`rec-${day}`).value = (appState.settings.recurring[day] || []).join(', ');
    });
}

function saveConfiguration() {
    appState.settings.icalUrl = document.getElementById('settings-ical-input').value.trim();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    days.forEach(day => {
        const value = document.getElementById(`rec-${day}`).value;
        appState.settings.recurring[day] = value.split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);
    });

    // Wipe today's uncompleted array shell to force a template re-mapping refresh
    const todayKey = getTodayKey();
    if (appState.days[todayKey] && appState.days[todayKey].bandwidth.length === 0 && appState.days[todayKey].absolutes.filter(t => t.done).length === 0) {
        delete appState.days[todayKey];
    }
    
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    initDay();
    toggleDrawer('settings-drawer');
}

// Future Drawer Implementation (Pull from Future Engine)
function renderFutureDrawer() {
    const container = document.getElementById('future-tasks-container');
    container.innerHTML = '';
    
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const currentDayName = getDayOfWeekName();
    const currentIdx = weekdays.indexOf(currentDayName);

    // Filter to display only upcoming days left in the template cycle
    const remainingDays = currentIdx === -1 ? weekdays : weekdays.slice(currentIdx + 1);

    if (remainingDays.length === 0) {
        container.innerHTML = `<p class="text-slate-600 text-xs italic text-center py-4">End of active weekday template pipeline.</p>`;
        return;
    }

    remainingDays.forEach(day => {
        const tasks = appState.settings.recurring[day] || [];
        if (tasks.length === 0) return;

        const dayDiv = document.createElement('div');
        dayDiv.className = 'bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-2';
        dayDiv.innerHTML = `<span class="text-xs font-bold text-slate-400 capitalize block border-b border-slate-800 pb-1">${day} Absolutes</span>`;
        
        const ul = document.createElement('ul');
        ul.className = 'space-y-1.5';

        tasks.forEach((taskText, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-slate-950 p-2 rounded text-xs border border-slate-800/60 hover:border-teal-500/50 transition cursor-pointer group'
            li.onclick = () => pullTaskToToday(day, index, taskText);
            li.innerHTML = `
                <span class="text-slate-300 group-hover:text-teal-400 transition">👉 ${taskText}</span>
                <span class="text-[10px] text-teal-600 uppercase font-bold tracking-wider opacity-0 group-hover:opacity-100 transition">Pull</span>
            `;
            ul.appendChild(li);
        });

        dayDiv.appendChild(ul);
        container.appendChild(dayDiv);
    });
}

function pullTaskToToday(targetDay, index, taskText) {
    // 1. Remove item from the template structure array
    appState.settings.recurring[targetDay].splice(index, 1);
    
    // 2. Inject task array directly into today's local bandwidth row
    const todayKey = getTodayKey();
    appState.days[todayKey].bandwidth.push({
        id: Date.now(),
        text: `[Pulled from ${targetDay.toUpperCase()}] ${taskText}`,
        done: false
    });

    saveState();
}

// Bottom Tabbed Horizon Views
function openHorizonDrawer(tab) {
    activeHorizonTab = tab;
    document.getElementById('horizon-title').innerText = `${tab} Vision Horizon`;
    document.getElementById('horizon-drawer').classList.remove('hidden');
    renderHorizonItems();
}

function renderHorizonItems() {
    const list = document.getElementById('horizon-list');
    list.innerHTML = '';
    
    const items = appState.horizon[activeHorizonTab] || [];
    if (items.length === 0) {
        list.innerHTML = `<li class="text-slate-600 text-xs italic p-4 text-center">No visionary items set for this period.</li>`;
        return;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-sm';
        li.innerHTML = `
            <span class="text-slate-300">${item}</span>
            <button onclick="deleteHorizonItem(${index})" class="text-rose-500 hover:text-rose-400 text-xs px-2">✕</button>
        `;
        list.appendChild(li);
    });
}

function addHorizonItem() {
    const input = document.getElementById('new-horizon-item');
    const value = input.value.trim();
    if (!value) return;

    appState.horizon[activeHorizonTab].push(value);
    input.value = '';
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    renderHorizonItems();
}

function deleteHorizonItem(index) {
    appState.horizon[activeHorizonTab].splice(index, 1);
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    renderHorizonItems();
}

// Runtime Execution Entry Point
window.onload = () => {
    initDay();
};
