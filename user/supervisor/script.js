const SUPABASE_URL = 'https://sxfwqdxkvcxxbbnvwaki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZndxZHhrdmN4eGJibnZ3YWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQzNTYsImV4cCI6MjA4NTgwMDM1Nn0.skux7wINToP4i4GfBU_8x3F_nwcSgJiwgcCWfGD0zIA'; 
const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = {
    activeT: null,
    competitors: [],
    judges: [],
    scores: []
};

// --- AUTH ---
async function handleLogin() {
    const tid = document.getElementById('login-tid').value.trim();
    const code = document.getElementById('login-code').value.trim();

    const { data: u, error } = await _client.from('judges').select('*, tournaments(*)').eq('judge_code', code).single();

    if (u && u.tournaments.short_id === tid && u.role === 'supervisor') {
        state.activeT = u.tournaments;
        document.getElementById('sup-login').classList.add('hidden');
        document.getElementById('sup-dashboard').classList.remove('hidden');
        initRealtime();
        loadInitialData();
    } else {
        alert("Access Denied: Tournament ID or Code Mismatch.");
    }
}

// --- DATA & REALTIME ---
async function loadInitialData() {
    const tid = state.activeT.id;
    const { data: comps } = await _client.from('competitors').select('*').eq('tournament_id', tid).order('order_index');
    const { data: judges } = await _client.from('judges').select('*').eq('tournament_id', tid).eq('role', 'judge');
    const { data: scores } = await _client.from('scores').select('*').eq('tournament_id', tid);

    state.competitors = comps;
    state.judges = judges;
    state.scores = scores;

    renderMatrix();
    updateUI();
}

function initRealtime() {
    _client.channel('sup-room')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, payload => {
        if(payload.new.id === state.activeT.id) {
            state.activeT = payload.new;
            updateUI();
        }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        if(payload.new.tournament_id === state.activeT.id) {
            // Update local state and re-render matrix
            const idx = state.scores.findIndex(s => s.id === payload.new.id);
            if(idx > -1) state.scores[idx] = payload.new; else state.scores.push(payload.new);
            renderMatrix();
        }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'competitors' }, payload => {
        const idx = state.competitors.findIndex(c => c.id === payload.new.id);
        if(idx > -1) state.competitors[idx] = payload.new;
        renderMatrix();
    })
    .subscribe();
}

// --- UI RENDERING ---
function renderMatrix() {
    const head = document.getElementById('matrix-head');
    const body = document.getElementById('matrix-body');
    
    // Header
    let h = `<th>Competitor</th><th>Art Type</th>`;
    state.judges.forEach((j, i) => h += `<th>Judge ${i+1}</th>`);
    h += `<th>Total</th>`;
    head.innerHTML = h;

    // Body
    body.innerHTML = state.competitors.map(c => {
        const isCurr = c.id === state.activeT.current_competitor_id;
        let total = 0;
        let judgeCells = state.judges.map(j => {
            const s = state.scores.find(sc => sc.competitor_id === c.id && sc.judge_id === j.id);
            if(s) total += parseFloat(s.score_value);
            return `<td>${s ? s.score_value.toFixed(1) : '<span class="waiting">-</span>'}</td>`;
        }).join('');

        return `
            <tr class="${isCurr ? 'active-row' : ''}">
                <td style="text-align:left; font-weight:bold;">${c.name}</td>
                <td><input class="input-art" onchange="updateArtType('${c.id}', this.value)" value="${c.art_type || ''}" placeholder="..."></td>
                ${judgeCells}
                <td style="color:var(--accent); font-weight:900;">${total.toFixed(1)}</td>
            </tr>
        `;
    }).join('');
}

function updateUI() {
    const t = state.activeT;
    document.getElementById('active-t-name').innerText = t.name;
    document.getElementById('t-id-display').innerText = t.short_id;
    document.getElementById('t-status').innerText = t.status.toUpperCase();
    
    // Control Button States
    document.getElementById('btn-timer').innerHTML = t.timer_status === 'running' ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    document.getElementById('btn-lock').innerHTML = t.is_locked ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-unlock"></i>';
    document.getElementById('btn-lock').style.color = t.is_locked ? 'var(--danger)' : 'white';

    // Check if current competitor is fully scored
    const currScores = state.scores.filter(s => s.competitor_id === t.current_competitor_id);
    const allDone = currScores.length >= state.judges.length;
    
    const btnPub = document.getElementById('btn-publish-score');
    btnPub.classList.toggle('disabled', !allDone);
    
    // Winner logic
    if (t.status === 'ended') {
        document.getElementById('btn-publish-winner').classList.remove('hidden');
    }
}

// --- ACTIONS ---
async function supervisorAction(type) {
    const t = state.activeT;
    
    if (type === 'start') {
        // Start Tournament: Initialize the first competitor and set timer to full performance time
        const { data: first } = await _client.from('competitors')
            .select('id').eq('tournament_id', t.id).order('order_index').limit(1).single();
            
        await _client.from('tournaments').update({ 
            status: 'live', 
            current_competitor_id: first.id, 
            timer_status: 'idle', 
            remaining_time_seconds: t.performance_time // Reset to Admin set time
        }).eq('id', t.id);

    } else if (type === 'toggle-timer') {
        const isRunning = t.timer_status === 'running';
        const updateData = {};

        if (!isRunning) {
            // PLAY: Record the moment it started
            updateData.timer_status = 'running';
            updateData.timer_started_at = new Date().toISOString();
        } else {
            // PAUSE: Calculate how much time was left and save it
            const elapsed = Math.floor((new Date() - new Date(t.timer_started_at)) / 1000);
            const newRemaining = Math.max(0, t.remaining_time_seconds - elapsed);
            
            updateData.timer_status = 'paused';
            updateData.remaining_time_seconds = newRemaining;
            updateData.timer_started_at = null;
        }
        await _client.from('tournaments').update(updateData).eq('id', t.id);

    } else if (type === 'next' || type === 'publish-score') {
        // NEXT / ADVANCE: Move to next player AND Reset Timer to Admin Default
        const idx = state.competitors.findIndex(c => c.id === t.current_competitor_id);
        
        if (state.competitors[idx + 1]) {
            await _client.from('tournaments').update({ 
                current_competitor_id: state.competitors[idx + 1].id,
                is_locked: false,
                timer_status: 'idle',
                timer_started_at: null,
                remaining_time_seconds: t.performance_time // <--- TIMER RESET TO ADMIN VALUE
            }).eq('id', t.id);
            
            if(type === 'publish-score') {
                // Logic to log scores (keep your existing log logic here)
                logCurrentScores(); 
            }
        } else {
            await _client.from('tournaments').update({ status: 'ended', timer_status: 'idle' }).eq('id', t.id);
        }
    } else if (type === 'toggle-lock') {
        await _client.from('tournaments').update({ is_locked: !t.is_locked }).eq('id', t.id);
    } else if (type === 'publish-winner') {
        document.getElementById('celebration').classList.remove('hidden');
    }
}

async function updateArtType(compId, val) {
    await _client.from('competitors').update({ art_type: val }).eq('id', compId);
}

// --- LOGS & PDF ---
async function openLogModal() {
    const { data: logs } = await _client.from('tournament_logs').select('*').eq('tournament_id', state.activeT.id);
    let html = `<table class="log-table"><thead><tr><th>Time</th><th>Competitor</th><th>Art</th><th>Judge</th><th>Score</th></tr></thead><tbody>`;
    logs.forEach(l => {
        html += `<tr><td>${new Date(l.created_at).toLocaleTimeString()}</td><td>${l.competitor_name}</td><td>${l.art_type}</td><td>${l.judge_code}</td><td>${l.score_value}</td></tr>`;
    });
    document.getElementById('log-table-container').innerHTML = html + `</tbody></table>`;
    document.getElementById('log-modal').classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { data: logs } = await _client.from('tournament_logs').select('*').eq('tournament_id', state.activeT.id);

    doc.setFontSize(18);
    doc.text(`Official Results: ${state.activeT.name}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Tournament ID: ${state.activeT.short_id} | Date: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableData = logs.map(l => [
        new Date(l.created_at).toLocaleString(),
        l.competitor_name,
        l.art_type,
        l.judge_code,
        l.score_value.toFixed(1)
    ]);

    doc.autoTable({
        startY: 40,
        head: [['Timestamp', 'Competitor', 'Art Type', 'Official Code', 'Score']],
        body: tableData,
    });

    doc.save(`${state.activeT.short_id}_Results.pdf`);
}

// --- UPDATED TIMER DISPLAY LOGIC ---
setInterval(() => {
    if (state.activeT) {
        const t = state.activeT;
        let displayTime = t.remaining_time_seconds;

        if (t.timer_status === 'running' && t.timer_started_at) {
            const elapsed = Math.floor((new Date() - new Date(t.timer_started_at)) / 1000);
            displayTime = Math.max(0, t.remaining_time_seconds - elapsed);
        }

        const mins = Math.floor(displayTime / 60).toString().padStart(2, '0');
        const secs = (displayTime % 60).toString().padStart(2, '0');
        const display = document.getElementById('main-timer');
        if (display) display.innerText = `${mins}:${secs}`;
    }
}, 1000);

// Helper for the log logic you already had
async function logCurrentScores() {
    const t = state.activeT;
    const currComp = state.competitors.find(c => c.id === t.current_competitor_id);
    const currScores = state.scores.filter(s => s.competitor_id === t.current_competitor_id);
    
    const logEntries = currScores.map(s => ({
        tournament_id: t.id,
        competitor_name: currComp.name,
        art_type: currComp.art_type,
        judge_code: state.judges.find(j => j.id === s.judge_id).judge_code,
        score_value: s.score_value
    }));

    await _client.from('tournament_logs').insert(logEntries);
}


/**
 * Safely leaves the live dashboard and returns to the login screen
 */
function leaveTournament() {
    if (confirm("Are you sure you want to leave the live control room? This will not stop the tournament, but you will need to log in again to control it.")) {
        // Option 1: Full reload to clear state and go to login
        location.reload(); 
        
        // Option 2: If you prefer to just toggle the UI without reload:
        // document.getElementById('sup-dashboard').classList.add('hidden');
        // document.getElementById('sup-login').classList.remove('hidden');
        // state.activeT = null;
    }
}