// scanner-utils.js - Centralized Scanner and Media Lookup Utilities
// Include this file after utils.js and cache.js in all HTML pages that need scanning

/**
 * SCANNER MANAGER CLASS
 * Handles barcode scanning with ZXing library
 */
class ScannerManager {
    constructor(config = {}) {
        // Existing config...
        this.onBarcodeScanned = config.onBarcodeScanned || (() => {});
        this.onStatusUpdate = config.onStatusUpdate || (() => {});
        this.onError = config.onError || (() => {});
        this.continuous = config.continuous || false;
        this.allowDuplicates = config.allowDuplicates || true;
        this.enableHapticFeedback = config.enableHapticFeedback !== false;
        this.pauseBetweenScans = config.pauseBetweenScans || 1500;
        
        // Enhanced state management
        this.codeReader = null;
        this.videoInputDevices = [];
        this.isScanning = false;
        this.isPaused = false;
        this.scannedBarcodes = new Set();
        this.currentVideoElement = null;
        
        // NEW: Add processing state tracking
        this.processingBarcodes = new Map(); // barcode -> timestamp
        this.lastScanTime = 0;
        this.minScanInterval = 2000; // Minimum 2 seconds between any scans
        
        this.handleScanResult = this.handleScanResult.bind(this);
    }

    /*Initialize the scanner - must be called before use*/
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
            setInterval(() => this.cleanupStaleProcessing(), 30000); // Run every 30s
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

    /* Stop camera and reset scanner */
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
        if (!this.isScanning || this.isPaused) {
            return;
        }
        
        if (result) {
            const barcode = result.text;
            const now = Date.now();
            
            if (now - this.lastScanTime < this.minScanInterval) {
                console.log(`Rate limiting: ${now - this.lastScanTime}ms since last scan`);
                return;
            }
            this.lastScanTime = now;

            if (this.processingBarcodes.has(barcode)) {
                const processingTime = now - this.processingBarcodes.get(barcode);
                console.log(`Barcode ${barcode} already processing for ${processingTime}ms`);
                this.updateStatus(`Processing ${barcode}...`, 'processing');
                return;
            }
            
            if (!this.allowDuplicates && this.scannedBarcodes.has(barcode)) {
                this.updateStatus(`Already processed: ${barcode}`, 'warning');
                return;
            }

            this.processingBarcodes.set(barcode, now);            
            this.updateStatus(`Processing: ${barcode}`, 'processing');
            
            if (this.enableHapticFeedback && navigator.vibrate) {
                navigator.vibrate(100);
            }
            
            this.processBarcode(barcode);
        } else if (error && !(error instanceof ZXing.NotFoundException)) {
            console.warn('Scanner error:', error);
        }
    }

    /**
     * Enhanced barcode processing
     */
    async processBarcode(barcode) {
        try {
            if (!/^\d{8,18}$/.test(barcode)) {
                throw new Error('Invalid barcode format (must be 8-18 digits)');
            }
            
            await this.onBarcodeScanned(barcode);
            
            // NEW: Mark as completed and remove from processing
            this.scannedBarcodes.add(barcode);
            this.processingBarcodes.delete(barcode);
            
            if (this.continuous) {
                setTimeout(() => {
                    if (this.isScanning && !this.isPaused) {
                        this.updateStatus('Ready for next barcode...', 'ready');
                    }
                }, this.pauseBetweenScans);
            } else {
                this.stopCamera();
            }
            
        } catch (error) {
            console.error('Error processing barcode:', error);
            
            // NEW: Remove from processing on error
            this.processingBarcodes.delete(barcode);
            
            this.onError(error.message, 'barcode_processing');
            
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
        const cleanBarcode = barcode.trim();

            if (this.processingBarcodes.has(cleanBarcode)) {
                this.onError('Barcode is currently being processed', 'processing');
                return false;
            }
            if (!barcode || !/^\d{8,18}$/.test(barcode.trim())) {
                this.onError('Please enter a valid barcode (8-18 digits)', 'manual_entry');
                return false;
            }
            
            if (!this.allowDuplicates && this.scannedBarcodes.has(cleanBarcode)) {
                this.onError('Barcode already processed', 'duplicate');
                return false;
            }
        
            if (this.processingBarcodes.has(cleanBarcode)) {
                this.onError('This barcode is currently being processed.', 'processing');
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
     * Clean up stale processing entries
     */
    cleanupStaleProcessing() {
        const now = Date.now();
        const staleTimeout = 30000; // 30 seconds
        
        for (const [barcode, timestamp] of this.processingBarcodes.entries()) {
            if (now - timestamp > staleTimeout) {
                console.log(`Cleaning up stale processing entry for ${barcode}`);
                this.processingBarcodes.delete(barcode);
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
            processingCount: this.processingBarcodes.size,
            scannedBarcodes: Array.from(this.scannedBarcodes),
            processingBarcodes: Array.from(this.processingBarcodes.keys()),
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
        this.processingBarcodes.clear();
        this.lastScanTime = 0;
    }
}

/*MEDIA LOOKUP UTILITIES === Handles UPC lookups and TMDB searches */
const MediaLookupUtils = {
    // API endpoints
    UPC_BASE_URL: '/api/upc',
    TMDB_BASE_URL: '/api/tmdb',
    TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p/w500',
    
    // Enhanced caching with persistence and TTL
    sessionCache: new Map(),
    persistentCache: null, // Will initialize with CacheManager
    
    // Request deduplication - prevent multiple simultaneous calls for same data
    pendingRequests: new Map(),
    
    // Initialize persistent caching
    init() {
        this.persistentCache = new CacheManager('media_lookup_cache_', 100, 24); // 24 hour cache
    },

    /* Enhanced UPC lookup with better caching and deduplication */
    async lookupUPCData(barcode) {
        const cacheKey = `upc_${barcode}`;
        
        // Check session cache first (fastest)
        if (this.sessionCache.has(cacheKey)) {
            console.log(`📦 Using session cache for UPC ${barcode}`);
            return this.sessionCache.get(cacheKey);
        }
        
        // Check persistent cache
        if (this.persistentCache) {
            const cached = this.persistentCache.get('upc', cacheKey);
            if (cached) {
                console.log(`💾 Using persistent cache for UPC ${barcode}`);
                this.sessionCache.set(cacheKey, cached);
                return cached;
            }
        }
        
        // Check if request is already pending (prevent duplicate API calls)
        if (this.pendingRequests.has(cacheKey)) {
            console.log(`⏳ Waiting for pending UPC request ${barcode}`);
            return this.pendingRequests.get(cacheKey);
        }
        
        // Make new request
        const requestPromise = this._fetchUPCData(barcode);
        this.pendingRequests.set(cacheKey, requestPromise);
        
        try {
            const result = await requestPromise;
            
            // Cache the result in both caches
            this.sessionCache.set(cacheKey, result);
            if (this.persistentCache) {
                this.persistentCache.set('upc', cacheKey, result);
            }
            
            return result;
        } finally {
            // Clean up pending request
            this.pendingRequests.delete(cacheKey);
        }
    },

    /* Internal UPC fetch method */
    async _fetchUPCData(barcode) {
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
            
            return {
                barcode: barcode,
                originalTitle: data.items[0].title || '',
                brand: data.items[0].brand || '',
                category: data.items[0].category || '',
                description: data.items[0].description || '',
                images: data.items[0].images || []
            };

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error - check your internet connection');
            }
            throw error;
        }
    },

 async searchTMDBForTitle(title, year = null, exactMatch = false) {
        // Create more specific cache keys based on search strategy
        const searchStrategy = exactMatch ? 'exact' : 'fuzzy';
        const cacheKey = `tmdb_${searchStrategy}_${title.toLowerCase().replace(/\s+/g, '_')}_${year || 'no_year'}`;
        
        // Check session cache
        if (this.sessionCache.has(cacheKey)) {
            console.log(`🎬 Using session cache for TMDB: "${title}"`);
            return this.sessionCache.get(cacheKey);
        }
        
        // Check persistent cache
        if (this.persistentCache) {
            const cached = this.persistentCache.get('tmdb', cacheKey);
            if (cached) {
                console.log(`💾 Using persistent cache for TMDB: "${title}"`);
                this.sessionCache.set(cacheKey, cached);
                return cached;
            }
        }
        
        // Check pending requests
        if (this.pendingRequests.has(cacheKey)) {
            console.log(`⏳ Waiting for pending TMDB request: "${title}"`);
            return this.pendingRequests.get(cacheKey);
        }
        
        // Make new request
        const requestPromise = this._searchTMDB(title, year, exactMatch);
        this.pendingRequests.set(cacheKey, requestPromise);
        
        try {
            const result = await requestPromise;
            
            // Cache successful results
            if (result) {
                // NEW: Make sure we cache the result WITH the matchScore preserved
                // The matchScore should already be on the result from _searchTMDB()
                this.sessionCache.set(cacheKey, result);
                if (this.persistentCache) {
                    this.persistentCache.set('tmdb', cacheKey, result);
                }
            }
            
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    },

    /* Internal TMDB search with optimized queries */
    async _searchTMDB(title, year = null, exactMatch = false) {
        try {
            if (!title || title.trim() === '') {
                throw new Error('No title to search');
            }
            
            // Try different search strategies in order of preference
            const searchStrategies = [
                // Strategy 1: Exact title + year (if provided)
                ...(year ? [{ query: `"${title}" ${year}`, priority: 'high' }] : []),
                
                // Strategy 2: Title + year without quotes
                ...(year ? [{ query: `${title} ${year}`, priority: 'medium' }] : []),
                
                // Strategy 3: Exact title only
                { query: `"${title}"`, priority: 'medium' },
                
                // Strategy 4: Title without quotes (fallback)
                ...(exactMatch ? [] : [{ query: title, priority: 'low' }])
            ];
            
            let bestResult = null;
            let bestScore = 0;
            
            for (const strategy of searchStrategies) {
                console.log(`🔍 TMDB Search Strategy: ${strategy.query} (${strategy.priority} priority)`);
                
                try {
                    const searchUrl = `${this.TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(strategy.query)}`;
                    const response = await fetch(searchUrl);
                    
                    if (!response.ok) continue;
                    
                    const searchData = await response.json();
                    
                    if (!searchData.results || searchData.results.length === 0) continue;
                    
                    // Filter to movies and TV shows only
                    const mediaResults = searchData.results.filter(item => 
                        item.media_type === 'movie' || item.media_type === 'tv'
                    );
                    
                    if (mediaResults.length === 0) continue;
                    
                    // Score this result set
                    const candidateResult = this.findBestTMDBMatch(mediaResults, title, year);
                    const score = this.scoreSearchResult(candidateResult, title, year, strategy.priority);
                    
                    console.log(`📊 Strategy "${strategy.query}" score: ${score}`);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = candidateResult;
                        
                        // If we got a very high score, don't bother with other strategies
                        if (score > 90 && strategy.priority === 'high') {
                            break;
                        }
                    }
                    
                } catch (strategyError) {
                    console.warn(`Strategy "${strategy.query}" failed:`, strategyError);
                    continue;
                }
            }
            
            if (!bestResult) {
                console.warn(`No TMDB results found for "${title}" - will need manual review`);
                
                return {
                    id: `upc_${Date.now()}`, // Temporary ID
                    title: title,
                    name: title,
                    overview: 'No results found - needs manual review',
                    poster_path: null,
                    release_date: null,
                    first_air_date: null,
                    media_type: 'movie',
                    matchScore: 0,  // This will trigger needs_review
                    popularity: 0,
                    vote_average: 0,
                    vote_count: 0,
                    needsManualReview: true  // Explicit flag
                };
            }
            
            // Get full details for the best match
            console.log(`🏆 Best match selected: "${bestResult.title || bestResult.name}" (score: ${bestScore})`);

            const detailsUrl = `${this.TMDB_BASE_URL}/${bestResult.media_type}/${bestResult.id}?append_to_response=credits`;
            const detailsResponse = await fetch(detailsUrl);

            if (!detailsResponse.ok) {
                throw new Error('Failed to load full movie details from TMDB');
            }

            const fullDetails = await detailsResponse.json();

            // IMPORTANT: Preserve the match score from our analysis
            fullDetails.matchScore = bestResult.matchScore;
            fullDetails.media_type = bestResult.media_type; // Also preserve media type

            console.log(`🔍 Preserved matchScore: ${fullDetails.matchScore} for "${fullDetails.title || fullDetails.name}"`);

            return fullDetails;
            
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error - check your internet connection');
            }
            throw error;
        }
    },

    /*Score a search result based on strategy and match quality*/
    scoreSearchResult(result, originalTitle, targetYear, strategyPriority) {
        let score = result.matchScore || 0;
        
        // Bonus for high-priority search strategies
        if (strategyPriority === 'high') score += 20;
        else if (strategyPriority === 'medium') score += 10;
        
        // Additional scoring for exact matches
        const resultTitle = (result.title || result.name || '').toLowerCase();
        const cleanOriginal = originalTitle.toLowerCase().trim();
        
        if (resultTitle === cleanOriginal) score += 25;
        
        // Year match bonus
        if (targetYear) {
            const resultYear = this.extractYearFromDate(result.release_date || result.first_air_date);
            if (resultYear === parseInt(targetYear)) score += 20;
        }
        
        // NEW: Penalize if popularity is very low (likely wrong match)
        if (result.popularity && result.popularity < 1) score -= 10;
        
        // NEW: Bonus for higher vote counts (more established movies)
        if (result.vote_count && result.vote_count > 100) score += 5;

        return Math.max(0, score);
    },
    
    /* Find the best TMDB match using multiple criteria */
    findBestTMDBMatch(results, originalTitle, targetYear = null) {
        if (results.length === 1) {
            return results[0];
        }

        console.log(`\n=== TMDB MATCHING DEBUG ===`);
        console.log(`Original title: "${originalTitle}"`);
        console.log(`Target year: ${targetYear}`);
        console.log(`Candidates (${results.length}):`);
        
        // Score each result
        const scoredResults = results.map(item => {
            const itemTitle = item.title || item.name;
            const itemYear = this.extractYearFromDate(item.release_date || item.first_air_date);
            
            let score = 0;
            let debugInfo = [];

            // 1. Title similarity (most important - 40 points max)
            const titleScore = this.calculateTitleSimilarity(originalTitle, itemTitle);
            score += titleScore;
            debugInfo.push(`Title: ${titleScore.toFixed(1)}`);

            // 2. Year matching (30 points max)
            if (targetYear && itemYear) {
                const yearDiff = Math.abs(targetYear - itemYear);
                if (yearDiff === 0) {
                    score += 30;
                    debugInfo.push(`Year: +30 (exact)`);
                } else if (yearDiff === 1) {
                    score += 20;
                    debugInfo.push(`Year: +20 (±1)`);
                } else if (yearDiff <= 3) {
                    score += 10;
                    debugInfo.push(`Year: +10 (±${yearDiff})`);
                } else {
                    debugInfo.push(`Year: +0 (±${yearDiff})`);
                }
            } else if (!targetYear) {
                debugInfo.push(`Year: N/A`);
            }

            // 3. Popularity bonus (15 points max)
            const popularityScore = Math.min(item.popularity / 10, 15);
            score += popularityScore;
            debugInfo.push(`Pop: ${popularityScore.toFixed(1)}`);

            // 4. Media type preference (10 points max)
            if (item.media_type === 'movie') {
                score += 10; // Prefer movies for physical media
                debugInfo.push(`Type: +10 (movie)`);
            } else {
                debugInfo.push(`Type: +0 (tv)`);
            }

            // 5. Vote average bonus (5 points max)
            const voteScore = Math.min(item.vote_average / 2, 5);
            score += voteScore;
            debugInfo.push(`Vote: ${voteScore.toFixed(1)}`);

            console.log(`  "${itemTitle}" (${itemYear || 'no year'}) - Score: ${score.toFixed(1)} [${debugInfo.join(', ')}]`);

            return {
                ...item,
                matchScore: score,
                matchYear: itemYear,
                debugInfo: debugInfo.join(', ')
            };
        });

        // Sort by score (highest first)
        scoredResults.sort((a, b) => b.matchScore - a.matchScore);

        const winner = scoredResults[0];
        console.log(`\nWinner: "${winner.title || winner.name}" with score ${winner.matchScore.toFixed(1)}`);
        console.log(`========================\n`);

        return winner;
    },

    needsManualReview(bestMatch, originalTitle, targetYear) {
        if (!bestMatch) {
            console.log('🔍 needsManualReview: No bestMatch');
            return true;
        }   
    
        if (bestMatch.needsManualReview) {
            console.log('🔍 needsManualReview: Explicit flag set');
            return true;
        }

        const score = bestMatch.matchScore || 0;
        const CONFIDENCE_THRESHOLD = 35; // Adjust this based on testing

        console.log(`🔍 needsManualReview: Score ${score} vs threshold ${CONFIDENCE_THRESHOLD}`);
        
        if (score < CONFIDENCE_THRESHOLD) {
            console.log('🔍 needsManualReview: Below threshold');
            return true;
        }
        
        if (targetYear) {
                const resultYear = this.extractYearFromDate(bestMatch.release_date || bestMatch.first_air_date);
                if (!resultYear || Math.abs(resultYear - targetYear) > 2) {
                    console.log(`🔍 needsManualReview: Year mismatch (target: ${targetYear}, result: ${resultYear})`);
                    return true;
                }
        }
        
        if (bestMatch.popularity && bestMatch.popularity < 0.5) {
                console.log(`🔍 needsManualReview: Low popularity (${bestMatch.popularity})`);
                return true;
        }        

        console.log('🔍 needsManualReview: Passed all checks - should NOT need review');
            return false;
        },

    /**
     * Calculate title similarity using multiple methods
     */
    calculateTitleSimilarity(original, candidate) {
        if (!original || !candidate) return 0;

        const origClean = this.normalizeTitle(original);
        const candClean = this.normalizeTitle(candidate);

        // Exact match gets full points
        if (origClean === candClean) {
            return 40;
        }

        // Check if one contains the other
        if (origClean.includes(candClean) || candClean.includes(origClean)) {
            return 35;
        }

        // Levenshtein distance-based scoring
        const distance = this.levenshteinDistance(origClean, candClean);
        const maxLength = Math.max(origClean.length, candClean.length);
        const similarity = 1 - (distance / maxLength);
        
        // Word overlap scoring
        const origWords = new Set(origClean.split(/\s+/));
        const candWords = new Set(candClean.split(/\s+/));
        const intersection = new Set([...origWords].filter(word => candWords.has(word)));
        const union = new Set([...origWords, ...candWords]);
        const wordSimilarity = intersection.size / union.size;

        // Combine the scores
        const combinedScore = (similarity * 0.6 + wordSimilarity * 0.4) * 40;
        
        return Math.max(0, combinedScore);
    },

    /**
     * Normalize title for comparison
     */
    normalizeTitle(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\b(the|a|an)\b/g, '') // Remove articles
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    },

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    },

    /**
     * Extract year from TMDB date string
     */
    extractYearFromDate(dateString) {
        if (!dateString) return null;
        const year = parseInt(dateString.substring(0, 4));
        return (year >= 1900 && year <= 2030) ? year : null;
    },

    /* Complete lookup: UPC -> Title Extraction -> TMDB Search */
    async completeMovieLookup(barcode) {
        try {
            console.log(`🚀 Starting complete lookup for barcode: ${barcode}`);
            
            // Step 1: Get UPC data (cached)
            const upcData = await this.lookupUPCData(barcode);
            console.log(`✅ UPC data retrieved: "${upcData.originalTitle}"`);
            
            // Step 2: Extract and clean movie title
            const cleanTitle = this.cleanMovieTitle(upcData.originalTitle);
            const extractedYear = this.extractYearFromTitle(upcData.originalTitle);
            console.log(`🧹 Cleaned title: "${cleanTitle}", Year: ${extractedYear || 'none'}`);
            
            // Step 3: Search TMDB with optimization
            const tmdbData = await this.searchTMDBForTitle(cleanTitle, extractedYear);
            console.log(`✅ TMDB data retrieved: "${tmdbData.title || tmdbData.name}"`);
            
            // Step 4: Create physical edition data
            const physicalEdition = this.createPhysicalEditionData(upcData);

            // Step 5: Determine confidence and review status
            let confidence = tmdbData.matchScore || 0; 
                // If no matchScore (likely from cache), calculate a basic confidence
                if (confidence === 0 && tmdbData && upcData) {
                    // Calculate a basic confidence based on title similarity
                    const titleSimilarity = this.calculateTitleSimilarity(cleanTitle, tmdbData.title || tmdbData.name);
                    const hasYear = extractedYear && (tmdbData.release_date || tmdbData.first_air_date);
                    const yearMatch = hasYear ? Math.abs(extractedYear - this.extractYearFromDate(tmdbData.release_date || tmdbData.first_air_date)) <= 1 : false;
                    
                    confidence = titleSimilarity + (yearMatch ? 20 : 0) + (tmdbData.popularity ? Math.min(tmdbData.popularity / 10, 15) : 0);
                    console.log(`📊 Calculated fallback confidence: ${confidence} (title: ${titleSimilarity}, year: ${yearMatch}, pop: ${tmdbData.popularity || 0})`);

                    // Update the tmdbData object so needsManualReview can see the calculated score
                    tmdbData.matchScore = confidence;
                }

            const needsReview = this.needsManualReview(tmdbData, cleanTitle, extractedYear);
            console.log(`📊 Match confidence: ${confidence}, Needs review: ${needsReview}`);    

            return {
                upcData,
                tmdbData,
                physicalEdition,
                cleanTitle,
                extractedYear,
                confidence, 
                needsReview    
            };
            
        } catch (error) {
            console.error('💥 Complete movie lookup failed:', error);
            throw error;
        }
    },

    /**
     * Clean movie title by removing format indicators and years
     */
    cleanMovieTitle(title) {
        if (!title) return '';
        
        let cleaned = title;
            const studioNames = [
                'warner home video', 'sony pictures', 'alpha video', 'universal studios',
                'paramount pictures', 'disney', 'mgm', 'columbia pictures', 'fox',
                'lionsgate', 'criterion collection', 'anchor bay', 'searchlight'
            ];

            studioNames.forEach(studio => {
                const regex = new RegExp(`\\b${studio}\\b`, 'gi');
                cleaned = cleaned.replace(regex, '');
            });
            
            cleaned = cleaned
            .replace(/\b(DVD|Blu-ray|Blu Ray|BD|4K|UHD|Ultra HD|HD)\b/gi, '')
            .replace(/\b(Widescreen|Full Screen|Fullscreen)\b/gi, '')
            .replace(/\b(Director's Cut|Extended Edition|Special Edition|Collector's Edition|Limited Edition|Anniversary Edition|Unrated|Theatrical|Ultimate Edition)\b/gi, '');

            // Step 3: Remove genre tags and marketing phrases
            cleaned = cleaned
                .replace(/\b(comedy|drama|action|thriller|horror|romance|sci-fi|fantasy|adventure|documentary)\b/gi, '')
                .replace(/\b(Version You've Never Seen|Special Features|Bonus Material|Behind the Scenes)\b/gi, '')
                .replace(/\b(used|new|sealed)\b/gi, '');
            
            // Step 4: Fix common punctuation issues
            cleaned = cleaned
                .replace(/\bs\b/g, "'s")  // Fix missing apostrophes
                .replace(/\bt\b/g, "'t")  // Fix "don t" -> "don't"
                .replace(/\bre\b/g, "'re") // Fix "you re" -> "you're"
                .replace(/\bve\b/g, "'ve") // Fix "I ve" -> "I've"
                .replace(/\bll\b/g, "'ll"); // Fix "I ll" -> "I'll"

            cleaned = cleaned.replace(/[\(\[]?\b(19|20)\d{2}\b[\)\]]?/g, '');
    
            // Step 6: Remove disc indicators and region codes
            cleaned = cleaned
                .replace(/\b(Disc \d+|Side [AB]|Region \d+|All Regions|Region Free|Region 1|Region 2|UK|US)\b/gi, '')
                .replace(/\b(Full Frame|Anamorphic|Pan & Scan)\b/gi, '');
            
            // Step 7: Clean up whitespace and punctuation
            cleaned = cleaned
                .replace(/\s+/g, ' ')  // Multiple spaces to single
                .replace(/[^\w\s&'-]/g, '') // Keep only word chars, spaces, &, ', -
                .replace(/^[^\w]+|[^\w]+$/g, '') // Remove leading/trailing non-word chars
                .trim();
            
            // Step 8: Proper case the result
            cleaned = cleaned.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
            
            // If cleaning resulted in empty or very short string, return original
            if (cleaned.length < 2) {
                return title.trim();
            }
            
            console.log(`Title cleaning: "${title}" → "${cleaned}"`);
            return cleaned;
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
    },

    /* Clear caches (useful for testing)*/
    clearCaches() {
        this.sessionCache.clear();
        this.pendingRequests.clear();
        if (this.persistentCache) {
            this.persistentCache.clearAll();
        }
        console.log('🗑️ All caches cleared');
    },

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            sessionCacheSize: this.sessionCache.size,
            pendingRequests: this.pendingRequests.size,
            persistentCacheSize: this.persistentCache ? this.persistentCache.getStats() : null
        };
    },
};

/* SCANNER UI HELPERS * Common UI functions for scanner interfaces */
const ScannerUI = {
    modal: null,
    input: null,

    /* Creates the modal and attaches listeners. Call this once on page load.*/
    initialize(onSubmit, onCancel) {
        // If modal already exists, do nothing.
        if (document.getElementById('manualBarcodeModal')) {
            return;
        }

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
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Store references to the elements
        this.modal = document.getElementById('manualBarcodeModal');
        this.input = document.getElementById('manualBarcodeInput');
        const submitBtn = document.getElementById('submitManualBarcodeBtn');
        const cancelBtn = document.getElementById('cancelManualBarcodeBtn');
        
        const handleSubmit = () => {
            if (onSubmit(this.input.value.trim())) {
                this.hideManualEntryModal();
            }
        };
        
        const handleCancel = () => {
            this.hideManualEntryModal();
            if (onCancel) onCancel();
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        });
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                handleCancel();
            }
        });
    },

    /* Show the existing modal */
    showManualEntryModal() {
        if (this.modal) {
            this.modal.classList.add('active');
            this.input.value = ''; // Clear previous input
            this.input.focus();
        }
    },

     /* Hide the existing modal */
    hideManualEntryModal() {
        if (this.modal) {
            this.modal.classList.remove('active');
        }
    },

    /*Create manual barcode entry modal*/
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

    /* Show manual entry modal */
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

    /* Hide manual entry modal */
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

    /* Update scanner status display*/
    updateStatus(message, type = 'info', elementId = 'scannerStatus') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `scanner-status status-${type}`;
        }
    }
};

    if (typeof window !== 'undefined') {
        // Initialize MediaLookupUtils immediately
        MediaLookupUtils.init();
        
        // Make utilities globally available
        window.ScannerManager = ScannerManager;
        window.MediaLookupUtils = MediaLookupUtils;
        window.ScannerUI = ScannerUI;
        
        // For backward compatibility, also expose as mediaLookupUtils
        window.mediaLookupUtils = MediaLookupUtils;
        
        console.log('🚀 Scanner utilities initialized successfully');
        
        // Optional: Log cache stats periodically in development
        if (window.location.hostname === 'localhost') {
            setInterval(() => {
                const stats = MediaLookupUtils.getCacheStats();
                console.log('📊 Cache Stats:', stats);
            }, 30000); // Every 30 seconds
        }
}

// Usage example with cache monitoring:
/*
// Monitor cache performance
setInterval(() => {
    const stats = MediaLookupUtils.getCacheStats();
    console.log('📊 Cache Stats:', stats);
}, 30000); // Every 30 seconds

// Test optimized lookup
async function testOptimizedLookup() {
    try {
        console.time('Lookup Time');
        const result = await MediaLookupUtils.completeMovieLookup('883929736171');
        console.timeEnd('Lookup Time');
        console.log('Result:', result);
    } catch (error) {
        console.error('Lookup failed:', error);
    }
}
*/

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ScannerManager,
        MediaLookupUtils,
        ScannerUI
    };
}