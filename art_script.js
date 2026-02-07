/**
 * EKF Portal Script
 * This page serves as a router to the modular user folders.
 */

window.onload = () => {
    console.log("EKF Tournament Portal Loaded.");
    // Clear any previous session data when returning to the main portal
    sessionStorage.removeItem('current_role');
};

// You can add a function here to check if the Supabase connection is live
// before allowing users to click buttons if needed.