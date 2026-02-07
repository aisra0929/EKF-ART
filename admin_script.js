const SUPABASE_URL = 'https://sxfwqdxkvcxxbbnvwaki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZndxZHhrdmN4eGJibnZ3YWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQzNTYsImV4cCI6MjA4NTgwMDM1Nn0.skux7wINToP4i4GfBU_8x3F_nwcSgJiwgcCWfGD0zIA'; 
const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = {
    editingId: null
};

// --- NAVIGATION ---
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    state.editingId = null;
}

function openCreateModal() {
    state.editingId = null;
    document.getElementById('modal-title').innerText = "Create New Tournament";
    document.getElementById('t-name').value = "";
    document.getElementById('t-competitors').value = "";
    document.getElementById('manage-modal').classList.remove('hidden');
}

// --- DASHBOARD LOADING ---
async function loadAdminDashboard() {
    console.log("Fetching Tournament Data...");
    const { data: tours, error } = await _client
        .from('tournaments')
        .select(`*, competitors!competitors_tournament_id_fkey(count)`)
        .order('created_at', { ascending: false });

    if (error) return console.error("Admin Load Error:", error);

    const grid = document.getElementById('tournament-grid');
    document.getElementById('t-count').innerText = tours.length;

    grid.innerHTML = tours.map(t => {
        const compCount = t.competitors[0]?.count || 0;
        const mins = Math.floor(t.performance_time / 60);
        const secs = t.performance_time % 60;
        
        return `
        <div class="t-card">
            <span class="status-tag">${t.status.toUpperCase()}</span>
            <h3 style="margin: 15px 0;">${t.name}</h3>
            <div class="t-info" style="font-size:0.9rem; color:#555; line-height:1.6;">
                <p><strong>ID:</strong> ${t.short_id}</p>
                <p><strong>Time:</strong> ${mins}m ${secs}s | <strong>Judges:</strong> ${t.judge_count}</p>
                <p><strong>Players:</strong> ${compCount}</p>
            </div>
            <div class="t-actions" style="margin-top:15px; display:flex; gap:8px;">
                <button class="ghost-btn" onclick="openEditModal('${t.id}')"><i class="fas fa-edit"></i> Manage</button>
                <button class="ghost-btn" onclick="viewCodes('${t.id}')"><i class="fas fa-key"></i> Codes</button>
                <button class="ghost-btn danger" onclick="deleteTournament('${t.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// --- CREATE / EDIT SAVE ---
async function saveTournament() {
    const name = document.getElementById('t-name').value.trim();
    const min = parseInt(document.getElementById('t-min').value) || 0;
    const sec = parseInt(document.getElementById('t-sec').value) || 0;
    const totalSec = (min * 60) + sec;
    const jCount = parseInt(document.getElementById('t-jcount').value) || 3;
    const compsRaw = document.getElementById('t-competitors').value.split('\n').filter(c => c.trim() !== "");

    if (!name || compsRaw.length === 0) return alert("Please enter a name and competitors.");

    if (state.editingId) {
        // UPDATE MODE
        await _client.from('tournaments').update({
            name: name, performance_time: totalSec, judge_count: jCount, remaining_time_seconds: totalSec
        }).eq('id', state.editingId);
    } else {
        // CREATE MODE
        const shortId = "T" + Math.floor(1000 + Math.random() * 9000);
        const { data: t, error } = await _client.from('tournaments').insert({
            name, short_id: shortId, performance_time: totalSec, judge_count: jCount,
            status: 'live', remaining_time_seconds: totalSec, timer_status: 'idle'
        }).select().single();

        if (error) return alert(error.message);

        // Add Competitors
        await _client.from('competitors').insert(compsRaw.map((c, i) => ({
            tournament_id: t.id, name: c.trim(), order_index: i + 1
        })));

        // Auto-assign first competitor
        const { data: first } = await _client.from('competitors').select('id').eq('tournament_id', t.id).order('order_index').limit(1).single();
        await _client.from('tournaments').update({ current_competitor_id: first.id }).eq('id', t.id);

        // Generate Access Codes
        await generateCodes(t.id, jCount, shortId);
    }

    closeModal('manage-modal');
    loadAdminDashboard();
}

async function openEditModal(tId) {
    const { data: t } = await _client.from('tournaments').select('*').eq('id', tId).single();
    const { data: comps } = await _client.from('competitors').select('name').eq('tournament_id', tId).order('order_index');

    state.editingId = tId;
    document.getElementById('modal-title').innerText = "Edit Tournament";
    document.getElementById('t-name').value = t.name;
    document.getElementById('t-min').value = Math.floor(t.performance_time / 60);
    document.getElementById('t-sec').value = t.performance_time % 60;
    document.getElementById('t-jcount').value = t.judge_count;
    document.getElementById('t-competitors').value = comps.map(c => c.name).join('\n');

    document.getElementById('manage-modal').classList.remove('hidden');
}

// --- ACCESS CODE LOGIC ---
async function generateCodes(tId, jCount, shortId) {
    // Clear old codes
    await _client.from('judges').delete().eq('tournament_id', tId);

    const sCode = Math.floor(100000 + Math.random() * 900000).toString();
    await _client.from('judges').insert({ tournament_id: tId, judge_code: sCode, role: 'supervisor' });

    for (let i = 0; i < jCount; i++) {
        const jCode = Math.floor(100000 + Math.random() * 900000).toString();
        await _client.from('judges').insert({ tournament_id: tId, judge_code: jCode, role: 'judge' });
    }
}

async function viewCodes(tId) {
    console.log("Loading codes for:", tId);
    const { data: t } = await _client.from('tournaments').select('short_id').eq('id', tId).single();
    const { data: js } = await _client.from('judges').select('*').eq('tournament_id', tId).order('role', {ascending: false});

    if (!js || js.length === 0) return alert("No codes found. Try editing the tournament to generate them.");

    let str = `TOURNAMENT ID: ${t.short_id}\n\n`;
    js.forEach(j => {
        str += `${j.role.toUpperCase()}: ${j.judge_code}\n`;
    });

    document.getElementById('codes-display').innerText = str;
    document.getElementById('codes-modal').classList.remove('hidden');
}

// --- DELETE ---
async function deleteTournament(tId) {
    if (confirm("Permanently delete this tournament?")) {
        await _client.from('tournaments').delete().eq('id', tId);
        loadAdminDashboard();
    }
}