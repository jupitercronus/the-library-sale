// main.js - The NEW Centralized Logic
document.addEventListener("DOMContentLoaded", function() {
    // Load the navbar
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            const navbarPlaceholder = document.getElementById("navbar-placeholder");
            if (navbarPlaceholder) {
                navbarPlaceholder.innerHTML = data;
            }
            // After navbar is loaded, initialize the authentication listener
            setupAuthentication();
        });

    // Load the footer
    const footerPlaceholder = document.getElementById("footer-placeholder");
    if (footerPlaceholder) {
        fetch("footer.html")
            .then(response => response.text())
            .then(data => {
                footerPlaceholder.innerHTML = data;
            })
            .catch(error => {
                console.error("Error loading footer:", error);
            });
    }
});

// This is now the ONLY onAuthStateChanged listener in the entire application
function setupAuthentication() {
    const auth = firebase.auth();
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;

    auth.onAuthStateChanged(user => {
        // Update the main login/logout button
        if (user) {
            authBtn.textContent = 'Logout';
            authBtn.title = 'Logout';
            authBtn.onclick = () => auth.signOut().then(() => window.location.href = 'index.html');
        } else {
            authBtn.textContent = 'Login';
            authBtn.title = 'Login';
            authBtn.onclick = () => window.location.href = 'auth.html';
        }

        // --- THE CRITICAL STEP ---
        // Announce the user's status to the rest of the application
        const authEvent = new CustomEvent('authStateReady', { detail: { user: user } });
        document.dispatchEvent(authEvent);
    });

    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');

    if (hamburgerBtn && navLinks) {
        hamburgerBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }
}