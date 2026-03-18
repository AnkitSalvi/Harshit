/**
 * Architecture Portfolio Template
 * Minimal JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    initSmoothScroll();
});

/**
 * Smooth scroll with offset for fixed navigation
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (!target) return;

            e.preventDefault();

            const navHeight = 80;
            const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });

            history.pushState(null, null, targetId);
        });
    });
}
