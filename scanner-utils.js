// scanner-utils.js - Centralized Scanner and Media Lookup Utilities
// Include this file after utils.js and cache.js in all HTML pages that need scanning

/**
 * SCANNER MANAGER CLASS
 * Handles barcode scanning with ZXing library
 */
class ScannerManager {
    constructor(config = {}) {
        // Configuration
        this.onBarcodeScanned = config.onBarcodeScanned || (() => {});
        this.onStatusUpdate = config.onStatusUpdate || (() => {});
        this.onError = config.onError || (() => {});
        this.continuous = config.continuous || false;
        this.allowDuplicates = config.allowDuplicates || true;
        this.enableHapticFeedback = config.enableHapticFeedback !== false;
        this.pauseBetweenScans = config.pauseBetweenScans || 1500; // ms
        
        // State
        this.codeReader = null;
        this.videoInputDevices = [];
        this.isScanning = false;
        this.isPaused = false;
        this.scannedBarcodes = new Set();
        this.currentVideoElement = null;
        
        // Bind methods to maintain context
        this.handleScanResult = this.handleScanResult.bind(this);
    }

    /**
     * Initialize the scanner - must be called before use
     */
    async initialize() {
        try {
            if (typeof ZXing === 'undefined' || !ZXing.BrowserMultiFormatReader) {
                throw new Error('ZXing library not loaded');
            }
            
            this.codeReader = new ZXing.BrowserMultiFormatReader();
            this.videoInputDevices = await this.codeReader.listVideoInputDevices();
            
            if (this.videoInputDevices.length === 0) {
                throw new Error('No camera devices found');
            }
            
            console.log(`Scanner initialized with ${this.videoInputDevices.length} camera(s)`);
            return true;
            
        } catch (error) {
            console.error('Scanner initialization failed:', error);
            this.onError(error.message, 'initialization');
            return false;
        }
    }

    /**
     * Start camera scanning
     * @param {HTMLVideoElement} videoElement - Video element to stream to
     * @param {string} statusElementId - ID of status message element (optional)
     */
    async startCamera(videoElement, statusElementId = null) {
        if (!this.codeReader || this.videoInputDevices.length === 0) {
            const error = 'Scanner not initialized or no cameras available';
            this.onError(error, 'start_camera');
            return false;
        }

        if (this.isScanning) {
            console.warn('Scanner already running');
            return true;
        }

        try {
            this.currentVideoElement = videoElement;
            this.isScanning = true;
            this.isPaused = false;
            
            // Start decoding from camera
            await this.codeReader.decodeFromVideoDevice(
                this.videoInputDevices[0].deviceId,
                videoElement,
                this.handleScanResult
            );
            
            const message = this.continuous ? 
                'Camera ready. Scan barcodes continuously.' : 
                'Camera ready. Position barcode in view.';
            
            this.updateStatus(message, 'ready', statusElementId);
            
            console.log('Camera started successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to start camera:', error);
            this.isScanning = false;
            this.onError(`Camera error: ${error.message}`, 'camera_start');
            return false;
        }
    }

    /**
     * Stop camera and reset scanner
     */
    stopCamera() {
        if (this.codeReader) {
            try {
                this.codeReader.reset();
            } catch (error) {
                console.warn('Error stopping camera:', error);
            }
        }
        
        this.isScanning = false;
        this.isPaused = false;
        this.currentVideoElement = null;
        
        console.log('Camera stopped');
    }

    /**
     * Pause/unpause scanning (for continuous mode)
     */
    togglePause() {
        if (!this.continuous) {
            console.warn('Pause/unpause only available in continuous mode');
            return;
        }
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            this.updateStatus('Scanning paused', 'paused');
        } else {
            this.updateStatus('Scanning resumed', 'ready');
        }
        
        return this.isPaused;
    }

    /**
     * Handle barcode scan results from ZXing
     */
    handleScanResult(result, error) {
        // Skip if not scanning or paused
        if (!this.isScanning || this.isPaused) {
            return;
        }
        
        if (result) {
            const barcode = result.text;
            
            // Check for duplicates if not allowed
            if (!this.allowDuplicates && this.scannedBarcodes.has(barcode)) {
                this.updateStatus(`Duplicate barcode: ${barcode}`, 'warning');
                return;
            }
            
            // Add to scanned set
            this.scannedBarcodes.add(barcode);
            
            // Provide user feedback
            this.updateStatus(`Scanned: ${barcode}`, 'processing');
            
            // Haptic feedback on mobile
            if (this.enableHapticFeedback && navigator.vibrate) {
                navigator.vibrate(100);
            }
            
            // Process the barcode
            this.processBarcode(barcode);
            
        } else if (error && !(error instanceof ZXing.NotFoundException)) {
            console.warn('Scanner error:', error);
            // Don't show every NotFoundException as they're normal
        }
    }

    /**
     * Process a scanned barcode
     */
    async processBarcode(barcode) {
        try {
            // Validate barcode format
            if (!/^\d{8,18}$/.test(barcode)) {
                throw new Error('Invalid barcode format (must be 8-18 digits)');
            }
            
            // Call the configured callback
            await this.onBarcodeScanned(barcode);
            
            // Handle continuous vs single scan modes
            if (this.continuous) {
                // Brief pause between scans in continuous mode
                setTimeout(() => {
                    if (this.isScanning && !this.isPaused) {
                        this.updateStatus('Ready for next barcode...', 'ready');
                    }
                }, this.pauseBetweenScans);
            } else {
                // Single scan mode - stop after first successful scan
                this.stopCamera();
            }
            
        } catch (error) {
            console.error('Error processing barcode:', error);
            this.onError(error.message, 'barcode_processing');
            
            // In continuous mode, keep scanning despite errors
            if (this.continuous) {
                setTimeout(() => {
                    if (this.isScanning && !this.isPaused) {
                        this.updateStatus('Ready for next barcode...', 'ready');
                    }
                }, this.pauseBetweenScans);
            }
        }
    }

    /**
     * Manually add a barcode (for manual entry)
     */
    async addManualBarcode(barcode) {
        if (!barcode || !/^\d{8,18}$/.test(barcode.trim())) {
            this.onError('Please enter a valid barcode (8-18 digits)', 'manual_entry');
            return false;
        }
        
        const cleanBarcode = barcode.trim();
        
        // Check for duplicates if not allowed
        if (!this.allowDuplicates && this.scannedBarcodes.has(cleanBarcode)) {
            this.onError('Barcode already processed', 'duplicate');
            return false;
        }
        
        try {
            this.scannedBarcodes.add(cleanBarcode);
            await this.onBarcodeScanned(cleanBarcode);
            return true;
        } catch (error) {
            console.error('Error processing manual barcode:', error);
            this.onError(error.message, 'manual_processing');
            return false;
        }
    }

    /**
     * Update status message
     */
    updateStatus(message, type = 'info', elementId = null) {
        this.onStatusUpdate(message, type);
        
        // Also update specific status element if provided
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = message;
                element.className = `scanner-status status-${type}`;
            }
        }
    }

    /**
     * Get scanner statistics
     */
    getStats() {
        return {
            isScanning: this.isScanning,
            isPaused: this.isPaused,
            scannedCount: this.scannedBarcodes.size,
            scannedBarcodes: Array.from(this.scannedBarcodes),
            hasCamera: this.videoInputDevices.length > 0,
            continuous: this.continuous
        };
    }

    /**
     * Reset scanner state
     */
    reset() {
        this.stopCamera();
        this.scannedBarcodes.clear();
    }
}

/**
 * MEDIA LOOKUP UTILITIES
 * Handles UPC lookups and TMDB searches
 */
const MediaLookupUtils = {
    // API endpoints
    UPC_BASE_URL: '/api/upc',
    TMDB_BASE_URL: '/api/tmdb',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w500',

    /**
     * Look up product information from UPC barcode
     */
    async lookupUPCData(barcode) {
        try {
            const response = await fetch(`${this.UPC_BASE_URL}?upc=${encodeURIComponent(barcode)}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `UPC API returned ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || data.code !== 'OK' || !data.items || data.items.length === 0) {
                throw new Error('No product found for this barcode');
            }
            
            const product = data.items[0];
            
            return {
                barcode: barcode,
                originalTitle: product.title || '',
                brand: product.brand || '',
                category: product.category || '',
                description: product.description || '',
                images: product.images || []
            };
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error - check your internet connection');
            }
            throw error;
        }
    },

    /**
     * Search TMDB for a movie/TV show by title
     */
    async searchTMDBForTitle(title, year = null) {
        try {
            if (!title || title.trim() === '') {
                throw new Error('No title to search');
            }
            
            let searchQuery = title.trim();
            if (year) {
                searchQuery += ` ${year}`;
            }
            
            const searchUrl = `${this.TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(searchQuery)}`;
            const response = await fetch(searchUrl);
            
            if (!response.ok) {
                throw new Error(`TMDB API returned ${response.status}`);
            }
            
            const searchData = await response.json();
            
            if (!searchData.results || searchData.results.length === 0) {
                if (year) {
                    // Try again without year
                    return await this.searchTMDBForTitle(title, null);
                }
                throw new Error(`No TMDB results found for "${title}"`);
            }
            
            // Filter to movies and TV shows only
            const mediaResults = searchData.results.filter(item => 
                item.media_type === 'movie' || item.media_type === 'tv'
            );
            
            if (mediaResults.length === 0) {
                throw new Error(`No movies or TV shows found for "${title}"`);
            }
            
            // Get the best match (first result after filtering)
            const bestMatch = mediaResults[0];
            
            // Get full details with credits
            const detailsUrl = `${this.TMDB_BASE_URL}/${bestMatch.media_type}/${bestMatch.id}?append_to_response=credits`;
            const detailsResponse = await fetch(detailsUrl);
            
            if (!detailsResponse.ok) {
                throw new Error('Failed to load full movie details from TMDB');
            }
            
            const detailsData = await detailsResponse.json();
            return detailsData;
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error - check your internet connection');
            }
            throw error;
        }
    },

    /**
     * Complete lookup: UPC -> Title Extraction -> TMDB Search
     */
    async completeMovieLookup(barcode) {
        try {
            // Step 1: Get UPC data
            const upcData = await this.lookupUPCData(barcode);
            
            // Step 2: Extract and clean movie title
            const cleanTitle = this.cleanMovieTitle(upcData.originalTitle);
            const extractedYear = this.extractYearFromTitle(upcData.originalTitle);
            
            // Step 3: Search TMDB
            const tmdbData = await this.searchTMDBForTitle(cleanTitle, extractedYear);
            
            // Step 4: Create physical edition data
            const physicalEdition = this.createPhysicalEditionData(upcData);
            
            return {
                upcData,
                tmdbData,
                physicalEdition,
                cleanTitle,
                extractedYear
            };
            
        } catch (error) {
            console.error('Complete movie lookup failed:', error);
            throw error;
        }
    },

    /**
     * Clean movie title by removing format indicators and years
     */
    cleanMovieTitle(title) {
        if (!title) return '';
        
        return title
            // Remove format indicators
            .replace(/\b(DVD|Blu-ray|Blu Ray|BD|4K|UHD|Ultra HD)\b/gi, '')
            // Remove edition types  
            .replace(/\b(Widescreen|Full Screen|Director's Cut|Extended Edition|Special Edition|Collector's Edition|Limited Edition)\b/gi, '')
            // Remove years in parentheses or brackets
            .replace(/[\(\[]?\b(19|20)\d{2}\b[\)\]]?/g, '')
            // Clean up whitespace
            .replace(/\s+/g, ' ')
            // Remove parenthetical info
            .replace(/\([^)]*\)/g, '')
            .trim() || title; // Return original if cleaning results in empty string
    },

    /**
     * Extract year from title string
     */
    extractYearFromTitle(title) {
        if (!title) return null;
        
        const yearMatch = title.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            const currentYear = new Date().getFullYear();
            // Validate year is reasonable
            if (year >= 1900 && year <= currentYear + 2) {
                return year;
            }
        }
        return null;
    },

    /**
     * Create physical edition data from UPC information
     */
    createPhysicalEditionData(upcData) {
        return {
            format: this.extractFormat(upcData.originalTitle, upcData.category),
            edition: this.extractEdition(upcData.originalTitle),
            region: this.extractRegion(upcData.originalTitle, upcData.description),
            distributor: upcData.brand || '',
            features: this.extractFeatures(upcData.originalTitle, upcData.description),
            barcode: upcData.barcode
        };
    },

    /**
     * Extract media format from title and category
     */
    extractFormat(title, category) {
        const formats = ['4K', 'UHD', 'Ultra HD', 'Blu-ray', 'Blu Ray', 'DVD', 'Digital', 'VHS'];
        const titleUpper = (title || '').toUpperCase();
        const categoryUpper = (category || '').toUpperCase();
        
        for (const format of formats) {
            if (titleUpper.includes(format.toUpperCase()) || categoryUpper.includes(format.toUpperCase())) {
                if (format === 'Blu Ray') return 'Blu-ray';
                if (format === 'Ultra HD' || titleUpper.includes('4K')) return '4K UHD';
                return format;
            }
        }
        
        // Default assumption based on common patterns
        if (titleUpper.includes('HD') || categoryUpper.includes('HD')) return 'Blu-ray';
        return 'DVD';
    },

    /**
     * Extract edition type from title
     */
    extractEdition(title) {
        const editions = [
            'Director\'s Cut', 'Extended Edition', 'Special Edition', 'Collector\'s Edition',
            'Limited Edition', 'Anniversary Edition', 'Theatrical Release', 'Unrated',
            'Ultimate Edition', 'Criterion Collection'
        ];
        
        const titleLower = (title || '').toLowerCase();
        
        for (const edition of editions) {
            if (titleLower.includes(edition.toLowerCase())) {
                return edition;
            }
        }
        
        return 'Standard';
    },

    /**
     * Extract region information
     */
    extractRegion(title, description) {
        const regions = ['Region 1', 'Region 2', 'Region 3', 'Region A', 'Region B', 'Region C', 'All Regions', 'Region Free'];
        const searchText = `${title || ''} ${description || ''}`.toLowerCase();
        
        for (const region of regions) {
            if (searchText.includes(region.toLowerCase())) {
                return region;
            }
        }
        
        // Default assumption for US market
        return 'Region 1';
    },

    /**
     * Extract special features from title and description
     */
    extractFeatures(title, description) {
        const features = [];
        const searchText = `${title || ''} ${description || ''}`.toLowerCase();
        
        const featureMap = {
            'commentary': 'Director Commentary',
            'deleted scenes': 'Deleted Scenes',
            'behind the scenes': 'Behind the Scenes',
            'making of': 'Making Of',
            'bloopers': 'Bloopers/Outtakes',
            'gag reel': 'Bloopers/Outtakes',
            'documentary': 'Documentary',
            'interviews': 'Cast/Crew Interviews',
            'featurette': 'Featurettes',
            'trailer': 'Trailers',
            'music video': 'Music Videos'
        };
        
        Object.entries(featureMap).forEach(([keyword, feature]) => {
            if (searchText.includes(keyword)) {
                features.push(feature);
            }
        });
        
        return features;
    },
    
    extractReleaseType(title) {
        const types = ['Initial Release', 'Re-release', 'Special Release', 'Anniversary'];
        const titleLower = title.toLowerCase();
        
        if (titleLower.includes('anniversary')) return 'Anniversary';
        if (titleLower.includes('special')) return 'Special Release';
        if (titleLower.includes('re-release') || titleLower.includes('rerelease')) return 'Re-release';
        
        return 'Initial Release';
    }
};

/**
 * SCANNER UI HELPERS
 * Common UI functions for scanner interfaces
 */
const ScannerUI = {
    /**
     * Create manual barcode entry modal
     */
    createManualEntryModal(onSubmit, onCancel) {
        const modalHtml = `
            <div class="modal" id="manualBarcodeModal">
                <div class="modal-content">
                    <h3>Manual Barcode Entry</h3>
                    <div class="form-group">
                        <label for="manualBarcodeInput">Barcode (8-18 digits)</label>
                        <input type="text" id="manualBarcodeInput" 
                               placeholder="Enter 8-18 digit barcode" 
                               pattern="[0-9]{8,18}" 
                               maxlength="18">
                    </div>
                    <div class="modal-buttons">
                        <button id="submitManualBarcodeBtn" class="btn btn-lg btn-success" title="Submit">
                            <span class="icon icon-confirm icon-lg"></span>
                        </button>
                        <button id="cancelManualBarcodeBtn" class="btn btn-lg btn-secondary" title="Cancel">
                            <span class="icon icon-close icon-lg"></span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existingModal = document.getElementById('manualBarcodeModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Set up event listeners
        const modal = document.getElementById('manualBarcodeModal');
        const input = document.getElementById('manualBarcodeInput');
        const submitBtn = document.getElementById('submitManualBarcodeBtn');
        const cancelBtn = document.getElementById('cancelManualBarcodeBtn');
        
        const handleSubmit = () => {
            const barcode = input.value.trim();
            if (onSubmit(barcode)) {
                this.hideManualEntryModal();
            }
        };
        
        const handleCancel = () => {
            this.hideManualEntryModal();
            if (onCancel) onCancel();
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        });
        
        // Handle backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        });
    },

    /**
     * Show manual entry modal
     */
    showManualEntryModal() {
        const modal = document.getElementById('manualBarcodeModal');
        const input = document.getElementById('manualBarcodeInput');
        
        if (modal) {
            modal.classList.add('active');
            if (input) {
                input.focus();
                input.value = '';
            }
        }
    },

    /**
     * Hide manual entry modal
     */
    hideManualEntryModal() {
        const modal = document.getElementById('manualBarcodeModal');
        if (modal) {
            modal.classList.remove('active');
        }
    },

    /**
     * Create scanner status display
     */
    createStatusDisplay(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="scanner-status" id="scannerStatus">Ready to scan</div>
        `;
    },

    /**
     * Update scanner status display
     */
    updateStatus(message, type = 'info', elementId = 'scannerStatus') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `scanner-status status-${type}`;
        }
    }
};

// Make utilities globally available
if (typeof window !== 'undefined') {
    window.ScannerManager = ScannerManager;
    window.MediaLookupUtils = MediaLookupUtils;
    window.ScannerUI = ScannerUI;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ScannerManager,
        MediaLookupUtils,
        ScannerUI
    };
}