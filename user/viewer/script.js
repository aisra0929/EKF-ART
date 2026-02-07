const SUPABASE_URL = 'https://sxfwqdxkvcxxbbnvwaki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZndxZHhrdmN4eGJibnZ3YWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQzNTYsImV4cCI6MjA4NTgwMDM1Nn0.skux7wINToP4i4GfBU_8x3F_nwcSgJiwgcCWfGD0zIA'; 
const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = { activeT: null };

async function loadTours() {
    const { data } = await _client.from('tournaments').select('*').neq('status', 'ended');
    document.getElementById('list').innerHTML = data.map(t => `<button onclick="startViewer('${t.id}')">${t.name}</button>`).join('');
}

async function startViewer(id) {
    const { data: t } = await _client.from('tournaments').select('*').eq('id', id).single();
    state.activeT = t;
    document.getElementById('selection').classList.add('hidden');
    document.getElementById('board').classList.remove('hidden');
    initSync(); refresh();
}

async function refresh() {
    const t = state.activeT;
    if(t.current_competitor_id) {
        const { data: c } = await _client.from('competitors').select('name').eq('id', t.current_competitor_id).single();
        document.getElementById('v-cname').innerText = c.name;
        const { data: scores } = await _client.from('scores').select('*').eq('competitor_id', t.current_competitor_id);
        const total = scores.reduce((a, b) => a + parseFloat(b.score_value), 0);
        document.getElementById('v-scores').innerHTML = scores.map(s => `<div class="v-score-box">${s.score_value.toFixed(1)}</div>`).join('');
        document.getElementById('v-total').innerText = total.toFixed(1);
    }
}

function initSync() {
    _client.channel('viewer-sync').on('postgres_changes', {event:'*', schema:'public'}, payload => {
        if(payload.table === 'tournaments') state.activeT = payload.new;
        refresh();
    }).subscribe();
}

loadTours();