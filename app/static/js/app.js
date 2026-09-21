// HK-NOVA - Frontend JS
// Version: 2.0 - Refined Dark Elegance with Phase 3 Enhancements

// Initialize Bootstrap tooltips globally
function initTooltips(root) {
    (root || document).querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function(el) {
        bootstrap.Tooltip.getOrCreateInstance(el);
    });
}

// Page fade-in animation
function initPageFadeIn() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease-in';
    
    window.addEventListener('load', function() {
        setTimeout(function() {
            document.body.style.opacity = '1';
        }, 50);
    });
}

// Smooth scroll to top button
function initScrollToTop() {
    const scrollBtn = document.createElement('button');
    scrollBtn.innerHTML = '<i class="bi bi-arrow-up"></i>';
    scrollBtn.className = 'scroll-to-top';
    scrollBtn.setAttribute('aria-label', 'Scroll to top');
    document.body.appendChild(scrollBtn);
    
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });
    
    scrollBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Add ripple effect to buttons
function initRippleEffect() {
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.btn');
        if (!target) return;
        
        const ripple = document.createElement('span');
        const rect = target.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        target.appendChild(ripple);
        
        setTimeout(function() {
            ripple.remove();
        }, 600);
    });
}

// Animate cards on scroll
function initScrollAnimations() {
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    document.querySelectorAll('.card, .alert').forEach(function(el) {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
    });
}

// Enhanced loading states
function initLoadingStates() {
    document.body.addEventListener('htmx:beforeRequest', function(evt) {
        const target = evt.target;
        if (target.classList.contains('btn')) {
            target.classList.add('loading');
            target.disabled = true;
        }
    });
    
    document.body.addEventListener('htmx:afterRequest', function(evt) {
        const target = evt.target;
        if (target.classList.contains('btn')) {
            target.classList.remove('loading');
            target.disabled = false;
        }
    });
}

// Success/Error toast notifications
function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.innerHTML = '<i class="bi bi-' + (type === 'success' ? 'check-circle' : 'exclamation-triangle') + '-fill me-2"></i>' + message;
    
    document.body.appendChild(toast);
    
    setTimeout(function() {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 3000);
}

// Smooth height transitions for collapsible elements
function initSmoothCollapse() {
    document.querySelectorAll('.collapse').forEach(function(el) {
        el.style.transition = 'height 0.3s ease';
    });
}

// HTMX configuration
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all enhancements
    initTooltips();
    initPageFadeIn();
    initScrollToTop();
    initRippleEffect();
    initScrollAnimations();
    initLoadingStates();
    initSmoothCollapse();

    // Re-init tooltips and animations after any HTMX swap
    document.body.addEventListener('htmx:afterSwap', function(evt) {
        initTooltips(evt.detail.target);
        initScrollAnimations();
    });

    // Configure HTMX defaults
    document.body.addEventListener('htmx:configRequest', function(evt) {
        // Add custom headers if needed
    });

    // Handle HTMX errors gracefully with toast
    document.body.addEventListener('htmx:responseError', function(evt) {
        console.error('HTMX request failed:', evt.detail);
        showToast('Request failed. Please try again.', 'error');
    });

    // Show success toast on successful HTMX requests
    document.body.addEventListener('htmx:afterRequest', function(evt) {
        if (evt.detail.successful && evt.detail.xhr.status === 200) {
            const action = evt.target.getAttribute('hx-post') || evt.target.getAttribute('hx-get');
            if (action && (action.includes('/test') || action.includes('/backup'))) {
                showToast('Operation completed successfully!', 'success');
            }
        }
    });

    // Auto-dismiss alerts after 5 seconds with fade out
    document.querySelectorAll('.alert-dismissible').forEach(function(alert) {
        setTimeout(function() {
            alert.style.transition = 'opacity 0.3s ease';
            alert.style.opacity = '0';
            setTimeout(function() {
                var bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
                bsAlert.close();
            }, 300);
        }, 5000);
    });
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K for quick search (if search exists)
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[type="text"][name="q"]');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });
});
