// utils.js - Centralized Utilities for the library sale
// Add this file to your project root and include it in all HTML pages

/**
 * STAR RATING UTILITIES
 */
const StarUtils = {
    /**
     * Generate star display HTML for showing ratings
     * @param {number} rating - Rating value (0-5)
     * @param {string} size - Size class: 'small', 'medium', 'large'
     * @returns {string} HTML string for star display
     */
    generateStarDisplay: (rating, size = 'medium') => {
        const totalStars = 5;
        const starHTML = '★★★★★';
        const filledWidth = (rating / totalStars) * 100;
        
        const sizeClasses = {
            small: 'font-size: 1em;',
            medium: 'font-size: 1.2em;',
            large: 'font-size: 1.5em;'
        };
        
        return `
            <div class="star-display" style="${sizeClasses[size]}">
                <span style="color: #ddd;">${starHTML}</span>
                <div class="star-display-filled" style="position: absolute; top: 0; left: 0; white-space: nowrap; overflow: hidden; color: #ffc107; width: ${filledWidth}%;">${starHTML}</div>
            </div>
        `;
    },

    /**
     * Set up interactive star rating component with mobile and desktop support
     * @param {string} containerId - ID of the star rating container
     * @param {function} onRatingChange - Callback when rating changes
     * @param {number} initialRating - Initial rating value
     */
    setupInteractiveStarRating: (containerId, onRatingChange, initialRating = 0) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        let currentRating = initialRating;
        let isDragging = false;
        let isTouching = false;
        const stars = Array.from(container.children);

        // Detect if device supports touch
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        const updateStars = (ratingToDisplay) => {
            stars.forEach((star, index) => {
                star.classList.remove('star-full', 'star-half');
                if (ratingToDisplay > index + 0.5) {
                    star.classList.add('star-full');
                } else if (ratingToDisplay > index) {
                    star.classList.add('star-half');
                }
            });
        };

        const clearHoverStates = () => {
            stars.forEach(star => {
                star.classList.remove('hover-star-full', 'hover-star-half');
            });
        };

        const calculateRatingFromPosition = (clientX) => {
            const containerRect = container.getBoundingClientRect();
            const posX = clientX - containerRect.left;
            
            // Find which star we're over
            let ratingValue = 0;
            let foundStar = false;
            
            stars.forEach((star, index) => {
                const starRect = star.getBoundingClientRect();
                const starLeft = starRect.left - containerRect.left;
                const starRight = starRect.right - containerRect.left;
                const starCenter = starLeft + (starRect.width / 2);
                
                if (posX >= starLeft && posX <= starRight && !foundStar) {
                    foundStar = true;
                    // Determine if it's left half (half star) or right half (full star)
                    if (posX < starCenter) {
                        ratingValue = index + 0.5;
                    } else {
                        ratingValue = index + 1;
                    }
                }
            });
            
            return ratingValue;
        };

        const applyHoverStates = (ratingValue) => {
            clearHoverStates();
            stars.forEach((star, index) => {
                if (ratingValue > index + 0.5) {
                    star.classList.add('hover-star-full');
                } else if (ratingValue > index) {
                    star.classList.add('hover-star-half');
                }
            });
        };

        const setRating = (ratingValue) => {
            currentRating = ratingValue;
            updateStars(currentRating);
            if (onRatingChange) onRatingChange(currentRating);
        };

        // Desktop mouse events
        const handleMouseMove = (e) => {
            if (isTouchDevice && !isDragging) return; // Ignore mouse events on touch devices unless dragging
            
            const ratingValue = calculateRatingFromPosition(e.clientX);
            applyHoverStates(ratingValue);
        };

        const handleMouseLeave = () => {
            if (isTouchDevice) return; // Touch devices don't need mouse leave
            clearHoverStates();
            updateStars(currentRating);
        };

        const handleClick = (e) => {
            if (isTouching) return; // Prevent double events on touch devices
            
            const ratingValue = calculateRatingFromPosition(e.clientX);
            setRating(ratingValue);
        };

        // Touch events for mobile
        const handleTouchStart = (e) => {
            e.preventDefault(); // Prevent scrolling and mouse events
            isTouching = true;
            isDragging = true;
            
            const touch = e.touches[0];
            const ratingValue = calculateRatingFromPosition(touch.clientX);
            applyHoverStates(ratingValue);
        };

        const handleTouchMove = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent scrolling
            
            const touch = e.touches[0];
            const ratingValue = calculateRatingFromPosition(touch.clientX);
            applyHoverStates(ratingValue);
        };

        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const touch = e.changedTouches[0];
            const ratingValue = calculateRatingFromPosition(touch.clientX);
            setRating(ratingValue);
            
            // Clear touch states
            isDragging = false;
            setTimeout(() => {
                isTouching = false;
            }, 100); // Small delay to prevent mouse events
        };

        // Add event listeners based on device capabilities
        if (isTouchDevice) {
            // Touch events for mobile
            container.addEventListener('touchstart', handleTouchStart, { passive: false });
            container.addEventListener('touchmove', handleTouchMove, { passive: false });
            container.addEventListener('touchend', handleTouchEnd, { passive: false });
            container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        } else {
            // Mouse events for desktop
            container.addEventListener('mousemove', handleMouseMove);
            container.addEventListener('mouseleave', handleMouseLeave);
        }
        
        // Click event for both (fallback for single taps)
        container.addEventListener('click', handleClick);

        // Set initial rating
        updateStars(currentRating);
        
        return {
            getRating: () => currentRating,
            setRating: (rating) => {
                currentRating = rating;
                updateStars(currentRating);
            }
        };
    }
};


/**
 * DATE FORMATTING UTILITIES
 */
const DateUtils = {
    /**
     * Format date for display
     * @param {Date|string|Timestamp} date - Date to format
     * @param {string} format - Format type: 'short', 'long', 'relative'
     * @returns {string} Formatted date string
     */
    formatDate: (date, format = 'short') => {
        if (!date) return 'N/A';
        
        let dateObj;
        if (date.toDate && typeof date.toDate === 'function') {
            // Firebase Timestamp
            dateObj = date.toDate();
        } else if (typeof date === 'string') {
            dateObj = new Date(date);
        } else {
            dateObj = date;
        }

        if (isNaN(dateObj.getTime())) return 'Invalid Date';

        switch (format) {
            case 'short':
                return dateObj.toLocaleDateString();
            case 'long':
                return dateObj.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            case 'relative':
                return DateUtils.getRelativeTime(dateObj);
            default:
                return dateObj.toLocaleDateString();
        }
    },

    /**
     * Get relative time string (e.g., "2 hours ago")
     * @param {Date} date - Date to compare
     * @returns {string} Relative time string
     */
    getRelativeTime: (date) => {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString();
    },

    /**
     * Get current date in YYYY-MM-DD format for input fields
     * @returns {string} Date string in YYYY-MM-DD format
     */
    getCurrentDateString: () => {
        return new Date().toISOString().split('T')[0];
    }
};

/**
 * ERROR HANDLING UTILITIES
 */
const ErrorUtils = {
    /**
     * Display user-friendly error messages
     * @param {Error|string} error - Error object or message
     * @param {string} context - Context where error occurred
     * @param {string} containerId - Container to show error (optional)
     */
    handleError: (error, context = 'Unknown', containerId = null) => {
        const errorMessage = typeof error === 'string' ? error : error.message;
        console.error(`Error in ${context}:`, error);

        const userFriendlyMessage = ErrorUtils.getUserFriendlyMessage(errorMessage);
        
        if (containerId) {
            ErrorUtils.showErrorInContainer(containerId, userFriendlyMessage, context);
        } else {
            ErrorUtils.showErrorModal('Error', userFriendlyMessage);
        }
    },

    /**
     * Convert technical error messages to user-friendly ones
     * @param {string} technicalMessage - Technical error message
     * @returns {string} User-friendly error message
     */
    getUserFriendlyMessage: (technicalMessage) => {
        const errorMappings = {
            'Permission denied': 'You don\'t have permission to perform this action.',
            'Network error': 'Please check your internet connection and try again.',
            'Document not found': 'The requested item could not be found.',
            'Authentication failed': 'Please log in and try again.',
            'Quota exceeded': 'Service temporarily unavailable. Please try again later.',
            'Invalid argument': 'Please check your input and try again.'
        };

        for (const [technical, friendly] of Object.entries(errorMappings)) {
            if (technicalMessage.toLowerCase().includes(technical.toLowerCase())) {
                return friendly;
            }
        }

        return 'Something went wrong. Please try again.';
    },

    /**
     * Show error in a specific container
     * @param {string} containerId - Container ID
     * @param {string} message - Error message
     * @param {string} context - Error context
     */
    showErrorInContainer: (containerId, message, context) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="error-state">
                <h3>Oops! Something went wrong</h3>
                <p>${message}</p>
                <button class="btn-retry" onclick="window.location.reload()">Try Again</button>
            </div>
        `;
    },

    /**
     * Show error modal (requires modal HTML structure)
     * @param {string} title - Modal title
     * @param {string} message - Error message
     */
    showErrorModal: (title, message) => {
        // Try to use existing modal structure
        const modal = document.getElementById('alertModal') || document.getElementById('confirmationModal');
        if (modal) {
            const titleEl = modal.querySelector('#alertModalTitle, #confirmationModalTitle');
            const messageEl = modal.querySelector('#alertModalMessage, #confirmationModalMessage');
            const okBtn = modal.querySelector('#alertModalOk, #confirmModalYes');

            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.textContent = message;
            if (okBtn) {
                okBtn.textContent = 'OK';
                okBtn.onclick = () => modal.style.display = 'none';
            }
            modal.style.display = 'flex';
        } else {
            // Fallback to alert
            alert(`${title}: ${message}`);
        }
    }
};

/**
 * INPUT VALIDATION UTILITIES
 */
const ValidationUtils = {
    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} Is valid email
     */
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Validate year input
     * @param {number|string} year - Year to validate
     * @returns {boolean} Is valid year
     */
    isValidYear: (year) => {
        const yearNum = parseInt(year);
        const currentYear = new Date().getFullYear();
        return yearNum >= 1900 && yearNum <= currentYear + 5;
    },

    /**
     * Validate barcode format
     * @param {string} barcode - Barcode to validate
     * @returns {boolean} Is valid barcode
     */
    isValidBarcode: (barcode) => {
        return /^\d{8,18}$/.test(barcode);
    },

    /**
     * Sanitize text input
     * @param {string} input - Input to sanitize
     * @param {number} maxLength - Maximum length (default 500)
     * @returns {string} Sanitized input
     */
    sanitizeInput: (input, maxLength = 500) => {
        if (!input) return '';
        return input.trim().substring(0, maxLength);
    },

    /**
     * Validate rating value
     * @param {number} rating - Rating to validate
     * @returns {boolean} Is valid rating
     */
    isValidRating: (rating) => {
        return typeof rating === 'number' && rating >= 0 && rating <= 5;
    }
};

/**
 * UI UTILITIES
 */
const UIUtils = {
    /**
     * Show loading state on button
     * @param {string|HTMLElement} button - Button element or ID
     * @param {string} loadingText - Text to show while loading
     */
    setButtonLoading: (button, loadingText = '') => {
        const btn = typeof button === 'string' ? document.getElementById(button) : button;
        if (!btn) return;

        btn.disabled = true;
        if (btn.classList.contains('btn-icon')) {
            btn.classList.add('loading');
        } else {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = loadingText;
        }
    },

    /**
     * Reset button from loading state
     * @param {string|HTMLElement} button - Button element or ID
     */
    resetButton: (button) => {
        const btn = typeof button === 'string' ? document.getElementById(button) : button;
        if (!btn) return;

        btn.disabled = false;
        if (btn.classList.contains('btn-icon')) {
            btn.classList.remove('loading');
        } else {
            if (btn.dataset.originalText) {
                btn.textContent = btn.dataset.originalText;
                delete btn.dataset.originalText;
            }
        }
    },

    /**
     * Debounce function calls
     * @param {function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {function} Debounced function
     */
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Show confirmation modal
     * @param {string} title - Modal title
     * @param {string} message - Modal message
     * @param {function} onConfirm - Callback for confirm action
     * @param {function} onCancel - Callback for cancel action
     */
    showConfirmModal: (title, message, onConfirm, onCancel = null) => {
        const modal = document.getElementById('confirmationModal');
        if (!modal) {
            if (confirm(`${title}\n\n${message}`)) {
                onConfirm();
            } else if (onCancel) {
                onCancel();
            }
            return;
        }

        const titleEl = document.getElementById('confirmationModalTitle');
        const messageEl = document.getElementById('confirmationModalMessage');
        const yesBtn = document.getElementById('confirmModalYes');
        const noBtn = document.getElementById('confirmModalNo');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        
        if (yesBtn) {
            yesBtn.onclick = () => {
                modal.style.display = 'none';
                onConfirm();
            };
        }
        
        if (noBtn) {
            noBtn.onclick = () => {
                modal.style.display = 'none';
                if (onCancel) onCancel();
            };
        }

        modal.style.display = 'flex';
    },

    /**
     * Format text for display with character limit
     * @param {string} text - Text to format
     * @param {number} limit - Character limit
     * @param {string} suffix - Suffix to add when truncated
     * @returns {string} Formatted text
     */
    truncateText: (text, limit = 100, suffix = '...') => {
        if (!text || text.length <= limit) return text || '';
        return text.substring(0, limit).trim() + suffix;
    },
    /**
     * Show status message to user
     * @param {string} message - Message to display
     * @param {string} type - Type: 'success', 'error', 'info'
     * @param {number} duration - Duration in milliseconds (default 3000)
     */
    showStatusMessage: (message, type = 'info', duration = 3000) => {
        const existingMessages = document.querySelectorAll('.toast-message');
        existingMessages.forEach(msg => msg.remove());
        const statusMessage = document.createElement('div');
        statusMessage.className = `toast-message status-message status-${type}`;
        const iconClass = type === 'success' ? 'icon-confirm' :
            type === 'error' ? 'icon-close' : 'icon-details';
        statusMessage.innerHTML = `<span class="icon ${iconClass} icon-md"></span>${message}`;
        // Position it as a toast
        statusMessage.style.position = 'fixed';
        statusMessage.style.top = 'var(--space-xl)';
        statusMessage.style.right = 'var(--space-xl)';
        statusMessage.style.zIndex = 'var(--z-modal)';
        statusMessage.style.minWidth = '300px';
        statusMessage.style.maxWidth = '500px';
        document.body.appendChild(statusMessage);
        // Auto-remove after duration
        setTimeout(() => {
            statusMessage.remove();
        }, duration);
    } 
};

// Usage example:
// const tracker = new PerformanceTracker('complete_movie_lookup');
// tracker.checkpoint('upc_lookup_complete');
// tracker.checkpoint('tmdb_search_complete');
// tracker.finish(true, { barcode: barcode, confidence: result.confidence });

// Dashboard Query Examples (run these in Firebase Console):
/*
// Get recent physical copy creation stats
db.collection('physicalCopyLogs')
  .where('operation', '==', 'CREATED')
  .where('timestamp', '>', firebase.firestore.Timestamp.fromDate(new Date(Date.now() - 24*60*60*1000)))
  .orderBy('timestamp', 'desc')
  .get();

// Get duplicate detection patterns
db.collection('physicalCopyLogs')
  .where('operation', '==', 'DUPLICATE_DETECTED')
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();

// Get performance metrics for slow operations
db.collection('physicalCopyLogs')
  .where('operation', '==', 'PERFORMANCE_METRIC')
  .where('data.value', '>', 5000) // Operations taking more than 5 seconds
  .orderBy('data.value', 'desc')
  .get();

// Get error patterns
db.collection('physicalCopyLogs')
  .where('operation', '==', 'FUNCTION_ERROR')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();
*/

/**
 * SKELETON LOADING UTILITIES
 */
const SkeletonUtils = {
    /**
     * Generate media grid skeleton HTML
     * @param {number} count - Number of skeleton items
     * @returns {string} Skeleton HTML
     */
    generateMediaGridSkeleton: (count = 6) => {
        return Array(count).fill(0).map(() => `
            <div class="skeleton-media-card">
                <div class="skeleton skeleton-poster"></div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-year"></div>
                <div class="skeleton-details">
                    <div class="skeleton skeleton-detail-line"></div>
                    <div class="skeleton skeleton-detail-line"></div>
                    <div class="skeleton skeleton-detail-line"></div>
                </div>
                <div class="skeleton skeleton-rating"></div>
                <div class="skeleton-actions">
                    <div class="skeleton skeleton-button"></div>
                    <div class="skeleton skeleton-button"></div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Show skeleton in container
     * @param {string} containerId - Container ID
     * @param {string} skeletonType - Type of skeleton
     * @param {number} count - Number of items
     */
    showSkeleton: (containerId, skeletonType, count = 6) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        const skeletonGenerators = {
            'media-grid': () => SkeletonUtils.generateMediaGridSkeleton(count),
            'list-grid': () => SkeletonUtils.generateListGridSkeleton(count),
            'activity-grid': () => SkeletonUtils.generateActivityGridSkeleton(count),
            'search-results': () => SkeletonUtils.generateSearchSkeleton(count)
        };

        const generator = skeletonGenerators[skeletonType];
        if (generator) {
            container.innerHTML = generator();
        }
    },

    generateListGridSkeleton: (count) => {
        return Array(count).fill(0).map(() => `
            <div class="skeleton-list-card">
                <div class="skeleton skeleton-list-poster"></div>
                <div class="skeleton-list-info">
                    <div class="skeleton skeleton-list-title"></div>
                    <div class="skeleton skeleton-list-meta"></div>
                    <div class="skeleton skeleton-list-description"></div>
                    <div class="skeleton skeleton-list-description"></div>
                </div>
            </div>
        `).join('');
    },

    generateActivityGridSkeleton: (count) => {
        return Array(count).fill(0).map(() => `
            <div class="skeleton-activity-item">
                <div class="skeleton skeleton-activity-poster"></div>
                <div class="skeleton skeleton-activity-text"></div>
            </div>
        `).join('');
    },

    generateSearchSkeleton: (count) => {
        return Array(count).fill(0).map(() => `
            <div class="skeleton-search-result">
                <div class="skeleton skeleton-search-poster"></div>
                <div class="skeleton-search-info">
                    <div class="skeleton skeleton-search-title"></div>
                    <div class="skeleton skeleton-search-overview"></div>
                    <div class="skeleton skeleton-search-overview"></div>
                </div>
            </div>
        `).join('');
    }
};

const SearchUtils = {
    /**
     * Creates a debounced function that delays invoking `searchFunction` until after `delay`
     * milliseconds have elapsed since the last time the debounced function was invoked.
     * The debounced function comes with a `cancel` method to cancel delayed `searchFunction`
     * invocations.
     * @param {Function} searchFunction The function to debounce.
     * @param {number} delay The number of milliseconds to delay.
     * @returns {{run: Function, cancel: Function}} An object with the debounced function and a cancel method.
     */
    createDebouncedSearch: (searchFunction, delay = 300) => {
        let timeoutId;

        const run = (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                searchFunction(...args);
            }, delay);
        };

        const cancel = () => {
            clearTimeout(timeoutId);
        };

        return { run, cancel };
    }
};

/**
 * GLOBAL UTILITIES OBJECT
 * Main export for easy access to all utilities
 */
const LibraryUtils = {
    stars: StarUtils,
    dates: DateUtils,
    errors: ErrorUtils,
    validation: ValidationUtils,
    ui: UIUtils,
    skeleton: SkeletonUtils,
    search: SearchUtils
};

// Make utilities globally available
if (typeof window !== 'undefined') {
    window.LibraryUtils = LibraryUtils;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LibraryUtils;
}
