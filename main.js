// main.js
document.addEventListener("DOMContentLoaded", function() {
    // Load the navbar
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("navbar-placeholder").innerHTML = data;

            // --- CENTRALIZED AUTH LOGIC ---
            // This logic now lives here to ensure the auth button works on every page.
            const authBtn = document.getElementById('authBtn');
            
            // We can safely assume the 'firebase' object is globally available 
            // because it's included in each HTML file before this script runs.
            const auth = firebase.auth();

            // 1. Set the button's text ('Login' or 'Logout') based on the user's status.
            auth.onAuthStateChanged(user => {
                if (user) {
                    authBtn.textContent = 'Logout';
                } else {
                    authBtn.textContent = 'Login';
                }
            });

            // 2. Add a single, reliable click listener for the button.
            authBtn.addEventListener('click', () => {
                if (auth.currentUser) {
                    // If a user is logged in, sign them out and redirect to the homepage.
                    auth.signOut().then(() => {
                        window.location.href = 'index.html';
                    }).catch(error => {
                        console.error("Logout failed:", error);
                    });
                } else {
                    // If no user is logged in, redirect to the authentication page.
                    window.location.href = 'auth.html';
                }
            });
            // --- END OF CENTRALIZED AUTH LOGIC ---

            // Highlight the active page link
            const currentPage = window.location.pathname.split("/").pop();
            const navLinks = document.querySelectorAll('.nav-link');
            
            navLinks.forEach(link => {
                if (link.getAttribute('href') === currentPage) {
                    link.classList.add('active');
                }
            });

            // Re-attach hamburger menu logic
            const hamburgerBtn = document.getElementById('hamburgerBtn');
            const navMenu = document.getElementById('navLinks');
            if (hamburgerBtn && navMenu) {
                hamburgerBtn.addEventListener('click', () => {
                    navMenu.classList.toggle('active');
                });
            }
        })
        .catch(error => {
            console.error("Error fetching navbar:", error);
            // If the navbar fails to load, the placeholder will be empty.
        });
});
