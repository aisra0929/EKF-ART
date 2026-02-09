const SUPABASE_URL = 'https://sxfwqdxkvcxxbbnvwaki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZndxZHhrdmN4eGJibnZ3YWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQzNTYsImV4cCI6MjA4NTgwMDM1Nn0.skux7wINToP4i4GfBU_8x3F_nwcSgJiwgcCWfGD0zIA'; 
const _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


async function saveTournament() {
    const name = document.getElementById('t-name').value;
    const time = parseInt(document.getElementById('t-min').value) * 60 + parseInt(document.getElementById('t-sec').value);
    const shortId = "T" + Math.floor(1000 + Math.random() * 9000);

    const { data: t } = await _client.from('tournaments').insert({
        name, short_id: shortId, performance_time: time, status: 'live'
    }).select().single();

    // Logic to add competitors and generate 6-digit codes...
    alert(`Tournament Created: ${shortId}`);
}