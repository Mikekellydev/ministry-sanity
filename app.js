const APP_STORAGE_KEY = 'ministry_sanity_data_v2';

// State structural initialization with multi-day pipelines
let appState = JSON.parse(localStorage.getItem(APP_STORAGE_KEY)) || {
    settings: { 
        icalUrl: '', 
        recurring: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } 
    },
    days: {},
    horizon: { monthly: [], quarterly: [], annual: [] }
};

// Structural state guard assertions
if (!appState.settings.recurring.saturday) appState.settings.recurring.saturday = [];
if (!appState.settings.recurring.sunday) appState.settings.recurring.sunday = [];

// --- DYNAMIC FOCUS STATE MANAGEMENT ---
let currentFocusDate = new Date(); // Track the currently viewed date actively
let activeHorizonTab = 'monthly';

function saveState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    renderActiveGrid();
    renderFutureDrawer();
}

function toggleDrawer(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden');
        if (id === 'settings-drawer' && !el.classList.contains('hidden')) {
            populateSettingsInputs();
        }
    }
}

// Convert a Date object instance explicitly into structural YYYY-MM-DD baseline
function getDateKey(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function getDayOfWeekName(dateObj) {
    return dateObj.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
}

// --- INTERACTIVE DATE NAVIGATION SEQUENCES ---
function navigateDays(offset) {
    currentFocusDate.setDate(currentFocusDate.getDate() + offset);
    initDay();
}

// System Core Entry Handler
function initDay() {
    const dayKey = getDateKey(currentFocusDate);
    const dayName = getDayOfWeekName(currentFocusDate);
    
    // Format Display Title with dynamic context
    document.getElementById('current-date').innerText = currentFocusDate.toLocaleDateString('en-US', { 
        weekday: 'long', month: 'short', day: 'numeric' 
    });

    // If target day has not been initialized yet, populate its baseline from repeating templates
    if (!appState.days[dayKey]) {
        const templateTasks = appState.settings.recurring[dayName] || [];
        appState.days[dayKey] = {
            absolutes: templateTasks.map((text, idx) => ({ id: Date.now() + idx, text: text, done: false })),
            bandwidth: []
        };
        saveState();
    }
    
    renderActiveGrid();
    renderFutureDrawer();
    
    if (appState.settings.icalUrl) {
        fetchCalendarFeed(appState.settings.icalUrl);
    }
}

// --- iCAL MULTI-PROXY STREAM PARSER ---
async function fetchCalendarFeed(url) {
    const eventContainer = document.getElementById('calendar-events');
    eventContainer.innerHTML = `<p class="italic text-teal-500 animate-pulse">Syncing agenda...</p>`;

    let targetUrl = url.replace('webcal://', 'https://');
    const proxyGateways = [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
        `https://cors-anywhere.herokuapp.com/${targetUrl}`
    ];

    for (let i = 0; i < proxyGateways.length; i++) {
        try {
            const currentProxyUrl = proxyGateways[i];
            const response = await fetch(currentProxyUrl);
            if (!response.ok) throw new Error(`Gateway index ${i} failed request.`);

            let rawText = "";
            if (currentProxyUrl.includes("allorigins.win")) {
                const json = await response.json();
                rawText = json.contents;
            } else {
                rawText = await response.text();
            }

            if (rawText && rawText.includes("BEGIN:VCALENDAR")) {
                parseAndRenderEvents(rawText);
                return;
            }
        } catch (error) {
            console.warn(`Proxy gateway variant index ${i} bypassed.`, error);
        }
    }
    eventContainer.innerHTML = `<p class="italic text-rose-500">⚠️ Calendar stream sync failed.</p>`;
}

// --- FOCUS-DATE AWARE RECURRENCE EXPANDER ---
function parseAndRenderEvents(rawDataStr) {
    const eventContainer = document.getElementById('calendar-events');
    
    try {
        const jcalData = ICAL.parse(rawDataStr);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        // Boundaries are structured dynamically against our current target view focus window
        const startOfDay = new Date(currentFocusDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(currentFocusDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        let focusDayEvents = [];

        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            
            if (event.isRecurring()) {
                const iterator = event.iterator(ICAL.Time.fromJSDate(startOfDay, true));
                let nextTime;
                
                while ((nextTime = iterator.next()) && nextTime.toJSDate() <= endOfDay) {
                    const occurrenceDate = nextTime.toJSDate();
                    if (occurrenceDate >= startOfDay && occurrenceDate <= endOfDay) {
                        addEventToPool(event, occurrenceDate);
                    }
                }
            } else {
                const dtstart = event.startDate.toJSDate();
                if (dtstart >= startOfDay && dtstart <= endOfDay) {
                    addEventToPool(event, dtstart);
                }
            }
        });

        function addEventToPool(event, dateObj) {
            let timeStr = "All Day";
            if (!event.startDate.isDate) { 
                timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            if (!focusDayEvents.some(e => e.summary === event.summary && e.time === timeStr)) {
                focusDayEvents.push({
                    time: timeStr,
                    summary: event.summary || "(No Title)",
                    rawTime: dateObj.getTime()
                });
            }
        }

        focusDayEvents.sort((a, b) => a.rawTime - b.rawTime);

        if (focusDayEvents.length === 0) {
            eventContainer.innerHTML = `<p class="italic text-slate-500 text-xs">No scheduled events found for this day view.</p>`;
        } else {
            eventContainer.innerHTML = focusDayEvents.map(e => `
                <div class="flex items-start gap-2 py-0.5">
                    <span class="text-teal-400 font-mono font-medium shrink-0 w-16 text-xs">${e.time}</span>
                    <span class="text-slate-200 truncate text-xs">${e.summary}</span>
                </div>
            `).join('');
        }

    } catch (parseError) {
        console.error(parseError);
        eventContainer.innerHTML = `<p class="italic text-rose-500">⚠️ Error parsing schedule streams.</p>`;
    }
}

// UI Grid Render Layer
function renderActiveGrid() {
    const dayKey = getDateKey(currentFocusDate);
    const currentDay = appState.days[dayKey] || { absolutes: [], bandwidth: [] };
    
    const absList = document.getElementById('absolutes-list');
    const bandList = document.getElementById('bandwidth-list');
    
    absList.innerHTML = '';
    bandList.innerHTML = '';

    if (currentDay.absolutes.length === 0) {
        absList.innerHTML = `<li class="text-slate-600 text-xs italic p-2 text-center">No assignments configured for this date block.</li>`;
    } else {
        currentDay.absolutes.forEach(task => absList.appendChild(createTaskRow(task, 'absolutes')));
    }

    if (currentDay.bandwidth.length === 0) {
        bandList.innerHTML = `<li class="text-slate-600 text-xs italic p-4 text-center">Live disruptions log is empty.</li>`;
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

// --- UPDATED FOR DYNAMIC FOCUS TARGET ACTIONS ---
function promptAddTask(type) {
    const text = prompt(`Enter new ${type} assignment for this day view:`);
    if (!text || text.trim() === '') return;
    
    const dayKey = getDateKey(currentFocusDate);
    appState.days[dayKey][type].push({ id: Date.now(), text: text.trim(), done: false });
    saveState();
}

function toggleTaskDone(id, type) {
    const dayKey = getDateKey(currentFocusDate);
    const task = appState.days[dayKey][type].find(t => t.id === id);
    if (task) task.done = !task.done;
    saveState();
}

function deleteTask(id, type) {
    const dayKey = getDateKey(currentFocusDate);
    appState.days[dayKey][type] = appState.days[dayKey][type].filter(t => t.id !== id);
    saveState();
}

// System Configurations Configuration Handlers
function populateSettingsInputs() {
    document.getElementById('settings-ical-input').value = appState.settings.icalUrl || '';
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const inputEl = document.getElementById(`rec-${day}`);
        if (inputEl) {
            inputEl.value = (appState.settings.recurring[day] || []).join(', ');
        }
    });
}

function saveConfiguration() {
    appState.settings.icalUrl = document.getElementById('settings-ical-input').value.trim();
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    days.forEach(day => {
        const inputEl = document.getElementById(`rec-${day}`);
        if (inputEl) {
            appState.settings.recurring[day] = inputEl.value.split(',')
                .map(item => item.trim())
                .filter(item => item.length > 0);
        }
    });

    const dayKey = getDateKey(currentFocusDate);
    if (appState.days[dayKey] && appState.days[dayKey].bandwidth.length === 0 && appState.days[dayKey].absolutes.filter(t => t.done).length === 0) {
        delete appState.days[dayKey];
    }
    
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
    initDay();
    toggleDrawer('settings-drawer');
}

// Weekly Lookahead Lookups
function renderFutureDrawer() {
    const container = document.getElementById('future-tasks-container');
    if (!container) return;
    container.innerHTML = '';
    
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const currentDayName = getDayOfWeekName(currentFocusDate);
    const currentIdx = weekdays.indexOf(currentDayName);

    const remainingDays = currentIdx === -1 ? weekdays : weekdays.slice(currentIdx + 1);

    if (remainingDays.length === 0) {
        container.innerHTML = `<p class="text-slate-600 text-xs italic text-center py-4">End of weekly template pipeline pipeline.</p>`;
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
            li.className = 'flex justify-between items-center bg-slate-950 p-2 rounded text-xs border border-slate-800/60 hover:border-teal-500/50 transition cursor-pointer group';
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
    appState.settings.recurring[targetDay].splice(index, 1);
    
    const dayKey = getDateKey(currentFocusDate);
    appState.days[dayKey].bandwidth.push({
        id: Date.now(),
        text: `[Pulled from ${targetDay.toUpperCase()}] ${taskText}`,
        done: false
    });

    saveState();
}

// Vision Horizons Drawer Controls
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
        list.innerHTML = `<li class="text-slate-600 text-xs italic p-4 text-center">No items set for this window.</li>`;
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

// Boot Entry Point
window.onload = () => {
    initDay();
};
