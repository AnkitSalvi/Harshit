/**
 * Studio Portfolio — Main JavaScript
 * Navigation, mobile menu, scroll animations
 */

document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu();
    initScrollAnimations();
    initSmoothScroll();
    initTileGrids();
});

/**
 * Tile grids (Projects, Objects).
 *
 * Every tile is the same height — one column's width at 3:4 — no matter how
 * many columns it spans, so widening a tile never makes it taller. The
 * height is published as a custom property because a two-column tile can't
 * derive it from its own width.
 */
function initTileGrids() {
    var grids = document.querySelectorAll('[data-collection]');
    if (!grids.length) return;

    function sync() {
        grids.forEach(function (grid) {
            var columns = window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
            var columnWidth = parseFloat(columns[0]);
            if (!columnWidth) return;
            grid.style.setProperty('--tile-height', Math.round(columnWidth * 4 / 3) + 'px');
        });
    }

    window.syncTileGrids = sync;

    window.addEventListener('resize', sync);
    window.addEventListener('load', sync);
    sync();
}

/**
 * Mobile hamburger menu toggle
 */
function initMobileMenu() {
    var hamburger = document.getElementById('nav-hamburger');
    var mobileMenu = document.getElementById('mobile-menu');
    if (!hamburger || !mobileMenu) return;

    hamburger.addEventListener('click', function () {
        hamburger.classList.toggle('open');
        mobileMenu.classList.toggle('open');
    });

    // Close menu when clicking a link
    mobileMenu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
            hamburger.classList.remove('open');
            mobileMenu.classList.remove('open');
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
        if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
            hamburger.classList.remove('open');
            mobileMenu.classList.remove('open');
        }
    });
}

/**
 * Scroll-triggered fade-in animations
 */
function initScrollAnimations() {
    var elements = document.querySelectorAll('.fade-in');
    if (!elements.length) return;

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    elements.forEach(function (el) {
        observer.observe(el);
    });
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;

            var target = document.querySelector(targetId);
            if (!target) return;

            e.preventDefault();

            var navHeight = 80;
            var targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });

            history.pushState(null, null, targetId);
        });
    });
}
