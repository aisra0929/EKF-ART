const SUPABASE_URL = 'https://sxfwqdxkvcxxbbnvwaki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZndxZHhrdmN4eGJibnZ3YWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQzNTYsImV4cCI6MjA4NTgwMDM1Nn0.skux7wINToP4i4GfBU_8x3F_nwcSgJiwgcCWfGD0zIA'; 
const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = {
    editingId: null
};

window.onload = () => {
    loadAdminDashboard();
};

// --- MODAL CONTROLS ---
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    state.editingId = null;
}

function openCreateModal() {
    state.editingId = null;
    document.getElementById('modal-title').innerText = "Initialize New Tournament";
    document.getElementById('save-btn').innerText = "Save & Launch";
    
    // Reset fields to default
    document.getElementById('t-name').value = "";
    document.getElementById('t-comp-size').value = "8";
    document.getElementById('t-gender').value = "Mixed";
    document.getElementById('t-kata-type').value = "Single";
    document.getElementById('t-min').value = "3";
    document.getElementById('t-sec').value = "0";
    document.getElementById('t-jcount').value = "5";
    
    generateCompetitorFields();
    document.getElementById('manage-modal').classList.remove('hidden');
}

// --- DYNAMIC INPUT LOGIC ---
function generateCompetitorFields(existingNames = []) {
    const size = parseInt(document.getElementById('t-comp-size').value);
    const container = document.getElementById('dynamic-competitors');
    container.innerHTML = ""; 

    for (let i = 1; i <= size; i++) {
        const val = existingNames[i-1] || "";
        const div = document.createElement('div');
        div.className = 'comp-input-wrapper';
        div.innerHTML = `
            <span class="comp-number">${i}.</span>
            <input type="text" class="comp-name-input" placeholder="Competitor Name" value="${val}">
        `;
        container.appendChild(div);
    }
}

// --- DASHBOARD LOADING ---
async function loadAdminDashboard() {
    console.log("Admin: Attempting to fetch tournaments...");
    
    // We simplify the query first to ensure basic data is moving
    const { data: tours, error } = await _client
        .from('tournaments')
        .select('*') 
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Supabase Error:", error.message);
        console.error("Details:", error.details);
        alert("Database Error: " + error.message);
        return;
    }

    console.log("Tournaments found:", tours.length, tours);

    const grid = document.getElementById('tournament-grid');
    if (!grid) {
        console.error("Error: Element 'tournament-grid' not found in HTML.");
        return;
    }

    document.getElementById('t-count').innerText = tours.length;

    if (tours.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #64748b;">
            <i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 10px;"></i>
            <p>No tournaments found. Create your first one from the sidebar!</p>
        </div>`;
        return;
    }

    grid.innerHTML = tours.map(t => {
        return `
        <div class="t-card">
            <div class="t-card-header">
                <span class="status-pill status-${t.status}">${t.status ? t.status.toUpperCase() : 'LIVE'}</span>
                <span class="t-id-badge">#${t.short_id}</span>
            </div>
            <h3>${t.name}</h3>
            <div class="t-details">
                <p><i class="fas fa-user-tag"></i> ${t.kata_type || 'Single'} | ${t.gender || 'Mixed'}</p>
                <p><i class="fas fa-gavel"></i> ${t.judge_count} Judges</p>
                <p><i class="fas fa-clock"></i> ${Math.floor(t.performance_time / 60)}m ${t.performance_time % 60}s</p>
            </div>
            <div class="t-card-actions">
                <button class="btn-edit" onclick="openEditModal('${t.id}')"><i class="fas fa-edit"></i> Manage</button>
                <button class="btn-codes" onclick="viewCodes('${t.id}')"><i class="fas fa-key"></i> Codes</button>
                <button class="btn-del" onclick="deleteTournament('${t.id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// --- EDIT MODAL LOGIC ---
async function openEditModal(tId) {
    state.editingId = tId;
    const { data: t } = await _client.from('tournaments').select('*').eq('id', tId).single();
    const { data: comps } = await _client.from('competitors').select('name').eq('tournament_id', tId).order('order_index');

    document.getElementById('modal-title').innerText = "Edit Tournament Settings";
    document.getElementById('save-btn').innerText = "Update Tournament";

    // Fill Basic Info
    document.getElementById('t-name').value = t.name;
    document.getElementById('t-min').value = Math.floor(t.performance_time / 60);
    document.getElementById('t-sec').value = t.performance_time % 60;
    document.getElementById('t-jcount').value = t.judge_count;
    document.getElementById('t-gender').value = t.gender || "Mixed";
    document.getElementById('t-kata-type').value = t.kata_type || "Single";
    
    // Set size and generate fields with existing names
    document.getElementById('t-comp-size').value = comps.length;
    generateCompetitorFields(comps.map(c => c.name));

    document.getElementById('manage-modal').classList.remove('hidden');
}

// --- SAVE / UPDATE LOGIC ---
async function saveTournament() {
    const name = document.getElementById('t-name').value.trim();
    const totalSec = (parseInt(document.getElementById('t-min').value) * 60) + parseInt(document.getElementById('t-sec').value);
    const jCount = parseInt(document.getElementById('t-jcount').value);
    const gender = document.getElementById('t-gender').value;
    const kataType = document.getElementById('t-kata-type').value;

    const compInputs = document.querySelectorAll('.comp-name-input');
    const compsRaw = Array.from(compInputs).map(input => input.value.trim()).filter(val => val !== "");

    if (!name || compsRaw.length === 0) return alert("Please fill in the name and competitors.");

    if (state.editingId) {
        // --- UPDATE MODE ---
        const { error: tErr } = await _client.from('tournaments').update({
            name, performance_time: totalSec, judge_count: jCount, gender, kata_type: kataType, remaining_time_seconds: totalSec
        }).eq('id', state.editingId);

        if(tErr) return alert("Update failed");

        // Simple sync for competitors: Delete old, add new
        await _client.from('competitors').delete().eq('tournament_id', state.editingId);
        await _client.from('competitors').insert(compsRaw.map((name, i) => ({
            tournament_id: state.editingId, name, order_index: i + 1
        })));

    } else {
        // --- CREATE MODE ---
        const shortId = "T" + Math.floor(1000 + Math.random() * 9000);
        const { data: t, error } = await _client.from('tournaments').insert({
            name, short_id: shortId, performance_time: totalSec, judge_count: jCount,
            gender, kata_type: kataType, status: 'live', remaining_time_seconds: totalSec, timer_status: 'idle'
        }).select().single();

        if (error) return alert(error.message);

        await _client.from('competitors').insert(compsRaw.map((name, i) => ({
            tournament_id: t.id, name, order_index: i + 1
        })));

        // Role Codes
        const sCode = Math.floor(100000 + Math.random() * 900000).toString();
        await _client.from('judges').insert({ tournament_id: t.id, judge_code: sCode, role: 'supervisor' });
        for (let i = 0; i < jCount; i++) {
            const jCode = Math.floor(100000 + Math.random() * 900000).toString();
            await _client.from('judges').insert({ tournament_id: t.id, judge_code: jCode, role: 'judge' });
        }
    }

    closeModal('manage-modal');
    loadAdminDashboard();
}

async function viewCodes(tId) {
    const { data: t } = await _client.from('tournaments').select('short_id').eq('id', tId).single();
    const { data: js } = await _client.from('judges').select('*').eq('tournament_id', tId).order('role', {ascending: false});
    let str = `TOURNAMENT ID: ${t.short_id}\n\n`;
    js.forEach(j => str += `${j.role.toUpperCase()}: ${j.judge_code}\n`);
    document.getElementById('codes-display').innerText = str;
    document.getElementById('codes-modal').classList.remove('hidden');
}

async function deleteTournament(tId) {
    if (confirm("Permanently delete this tournament?")) {
        await _client.from('tournaments').delete().eq('id', tId);
        loadAdminDashboard();
    }
}