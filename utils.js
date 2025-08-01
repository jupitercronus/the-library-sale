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
     * Set up interactive star rating component
     * @param {string} containerId - ID of the star rating container
     * @param {function} onRatingChange - Callback when rating changes
     * @param {number} initialRating - Initial rating value
     */
    setupInteractiveStarRating: (containerId, onRatingChange, initialRating = 0) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        let currentRating = initialRating;
        const stars = Array.from(container.children);

        const updateStars = () => {
            stars.forEach((star, index) => {
                star.classList.remove('full', 'half');
                if (currentRating > index + 0.5) {
                    star.classList.add('full');
                } else if (currentRating > index) {
                    star.classList.add('half');
                }
            });
        };

        container.addEventListener('mousemove', e => {
            const rect = container.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const hoverValue = Math.round(percent * 5 * 2) / 2;
            
            stars.forEach((star, index) => {
                star.classList.remove('hover-full', 'hover-half');
                if (hoverValue > index + 0.5) {
                    star.classList.add('hover-full');
                } else if (hoverValue > index) {
                    star.classList.add('hover-half');
                }
            });
        });

        container.addEventListener('mouseleave', () => {
            stars.forEach(star => {
                star.classList.remove('hover-full', 'hover-half');
            });
            updateStars();
        });

        container.addEventListener('click', e => {
            const rect = container.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            currentRating = Math.round(percent * 5 * 2) / 2;
            updateStars();
            if (onRatingChange) onRatingChange(currentRating);
        });

        updateStars();
        return {
            getRating: () => currentRating,
            setRating: (rating) => {
                currentRating = rating;
                updateStars();
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
    setButtonLoading: (button, loadingText = 'Loading...') => {
        const btn = typeof button === 'string' ? document.getElementById(button) : button;
        if (!btn) return;

        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText;
    },

    /**
     * Reset button from loading state
     * @param {string|HTMLElement} button - Button element or ID
     */
    resetButton: (button) => {
        const btn = typeof button === 'string' ? document.getElementById(button) : button;
        if (!btn) return;

        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
            delete btn.dataset.originalText;
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
    }
};

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
    createDebouncedSearch: (searchFunction, delay = 300) => {
        let timeout;
        let isLoading = false;
        
        return function executedFunction(query, loadingElement) {
            clearTimeout(timeout);
            
            if (loadingElement && !isLoading) {
                loadingElement.style.display = 'block';
                isLoading = true;
            }
            
            timeout = setTimeout(async () => {
                try {
                    await searchFunction(query);
                } finally {
                    if (loadingElement) {
                        loadingElement.style.display = 'none';
                        isLoading = false;
                    }
                }
            }, delay);
        };
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