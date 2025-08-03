// main.js
document.addEventListener("DOMContentLoaded", function() {
    // Load the navbar
    fetch("navbar.html")
        .then(response => response.text())
        .then(data => {
            document.getElementById("navbar-placeholder").innerHTML = data;

            // Highlight the active page link
            const currentPage = window.location.pathname.split("/").pop(); // Gets 'index.html', 'lists.html', etc.
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
        });
});