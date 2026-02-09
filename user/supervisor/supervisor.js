// Supervisor Realtime Logic
function initSupervisor() {
    const tId = sessionStorage.getItem('activeTId');
    _client.channel('sup-matrix')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores' }, payload => {
        updateMatrixCell(payload.new); // Instantly update the table cell
    }).subscribe();
}

async function toggleLock() {
    const isLocked = state.tournament.is_locked;
    await _client.from('tournaments').update({ is_locked: !isLocked }).eq('id', tId);
}

async function nextCompetitor() {
    // Logic to update current_competitor_id to next in order index
}