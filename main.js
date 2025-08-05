// main.js
document.addEventListener("DOMContentLoaded", function() {
    // Load the navbar
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            const navbarPlaceholder = document.getElementById("navbar-placeholder");
            if (navbarPlaceholder) {
                navbarPlaceholder.innerHTML = data;
            }

            // Highlight the active page link
            const currentPage = window.location.pathname.split("/").pop();
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                if (link.getAttribute('href') === currentPage) {
                    link.classList.add('active');
                }
            });

            // Re-attach hamburger menu logic if needed
            const hamburgerBtn = document.getElementById('hamburgerBtn');
            const navMenu = document.getElementById('navLinks');
            if (hamburgerBtn && navMenu) {
                hamburgerBtn.addEventListener('click', () => {
                    navMenu.classList.toggle('active');
                });
            }
            document.dispatchEvent(new Event('navbarLoaded'));
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
        // ADD THIS NEW FUNCTION
        function setupAuthButton() {
            const auth = firebase.auth();
            const authBtn = document.getElementById('authBtn');

            if (!authBtn) return;

            auth.onAuthStateChanged(user => {
                if (user) {
                    // User is signed in
                    authBtn.textContent = 'Logout';
                    authBtn.title = 'Logout';
                    authBtn.onclick = () => {
                        auth.signOut().then(() => {
                            // Redirect to home page after sign out to refresh state
                            window.location.href = 'index.html';
                        });
                    };
                } else {
                    // User is signed out
                    authBtn.textContent = 'Login';
                    authBtn.title = 'Login';
                    authBtn.onclick = () => {
                        window.location.href = 'auth.html';
                    };
                }
            });
        }

