/**
 * cache.js - A client-side caching system using localStorage.
 * Implements an LRU (Least Recently Used) eviction policy when the size limit is reached.
 */

class CacheManager {
    /**
     * Initializes the CacheManager.
     * @param {string} prefix - A prefix for all localStorage keys to avoid collisions.
     * @param {number} maxSizeMB - The maximum size of the cache in megabytes.
     * @param {number} defaultExpiryHours - The default cache item expiry time in hours.
     */
    constructor(prefix = 'appCache_', maxSizeMB = 5, defaultExpiryHours = 24) {
        this.prefix = prefix;
        this.maxSizeBytes = maxSizeMB * 1024 * 1024;
        this.defaultExpiryMs = defaultExpiryHours * 60 * 60 * 1000;
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0
        };
        console.log(`CacheManager initialized with ${maxSizeMB}MB limit and ${defaultExpiryHours}hr expiry.`);
    }

    /**
     * Generates the full localStorage key for a cache item.
     * @param {string} cacheType - The category of the cache (e.g., 'search', 'details').
     * @param {string} key - The specific key for the item.
     * @returns {string} The full localStorage key.
     */
    _getStorageKey(cacheType, key) {
        return `${this.prefix}${cacheType}_${key}`;
    }

    /**
     * Retrieves the metadata index for a given cache type.
     * The index tracks item sizes and last-used timestamps for the LRU policy.
     * @param {string} cacheType - The category of the cache.
     * @returns {object} The cache index.
     */
    _getCacheIndex(cacheType) {
        const indexKey = `${this.prefix}_index_${cacheType}`;
        try {
            const index = localStorage.getItem(indexKey);
            return index ? JSON.parse(index) : {};
        } catch (e) {
            console.error("Error reading cache index:", e);
            return {};
        }
    }

    /**
     * Saves the metadata index for a given cache type.
     * @param {string} cacheType - The category of the cache.
     * @param {object} index - The cache index to save.
     */
    _saveCacheIndex(cacheType, index) {
        const indexKey = `${this.prefix}_index_${cacheType}`;
        try {
            localStorage.setItem(indexKey, JSON.stringify(index));
        } catch (e) {
            console.error("Error saving cache index:", e);
        }
    }

    /**
     * Retrieves an item from the cache.
     * @param {string} cacheType - The category of the cache.
     * @param {string} key - The key of the item to retrieve.
     * @returns {any|null} The cached data, or null if not found or expired.
     */
    get(cacheType, key) {
        const storageKey = this._getStorageKey(cacheType, key);
        const rawItem = localStorage.getItem(storageKey);

        if (!rawItem) {
            this.stats.misses++;
            return null;
        }

        try {
            const item = JSON.parse(rawItem);

            // Check for expiration
            if (Date.now() > item.expiry) {
                console.log(`Cache item '${key}' expired. Removing.`);
                this.remove(cacheType, key);
                this.stats.misses++;
                return null;
            }

            // Update lastUsed timestamp for LRU
            const index = this._getCacheIndex(cacheType);
            if (index[key]) {
                index[key].lastUsed = Date.now();
                this._saveCacheIndex(cacheType, index);
            }
            
            this.stats.hits++;
            console.log(`Cache hit for '${key}' in '${cacheType}'.`);
            return item.data;
        } catch (e) {
            console.error("Error parsing cached item:", e);
            this.remove(cacheType, key); // Remove corrupted item
            return null;
        }
    }

    /**
     * Adds or updates an item in the cache.
     * @param {string} cacheType - The category of the cache.
     * @param {string} key - The key of the item to set.
     * @param {any} data - The data to store.
     * @param {number|null} expiryHours - Optional custom expiry in hours.
     */
    set(cacheType, key, data, expiryHours = null) {
        const storageKey = this._getStorageKey(cacheType, key);
        const expiry = Date.now() + (expiryHours ? expiryHours * 60 * 60 * 1000 : this.defaultExpiryMs);

        const item = {
            data: data,
            expiry: expiry,
        };

        try {
            const stringifiedItem = JSON.stringify(item);
            const itemSize = stringifiedItem.length;
            
            const index = this._getCacheIndex(cacheType);
            index[key] = {
                size: itemSize,
                lastUsed: Date.now()
            };

            localStorage.setItem(storageKey, stringifiedItem);
            this._saveCacheIndex(cacheType, index);
            this.stats.sets++;
            console.log(`Cached item '${key}' in '${cacheType}'. Size: ${itemSize} bytes.`);

            // Enforce size limits after adding the new item
            this._enforceSizeLimit();

        } catch (e) {
            console.error("Error setting cache item:", e);
            // If quota is exceeded, try to make space and retry
            if (e.name === 'QuotaExceededError') {
                console.warn("LocalStorage quota exceeded. Attempting to clear space...");
                this._enforceSizeLimit(true); // Force eviction
                try {
                    localStorage.setItem(storageKey, JSON.stringify(item));
                } catch (e2) {
                    console.error("Failed to set cache item even after cleanup:", e2);
                }
            }
        }
    }

    /**
     * Removes an item from the cache.
     * @param {string} cacheType - The category of the cache.
     * @param {string} key - The key of the item to remove.
     */
    remove(cacheType, key) {
        localStorage.removeItem(this._getStorageKey(cacheType, key));
        const index = this._getCacheIndex(cacheType);
        delete index[key];
        this._saveCacheIndex(cacheType, index);
    }

    /**
     * Enforces the cache size limit using an LRU eviction strategy.
     * @param {boolean} force - If true, runs eviction even if size is not over limit.
     */
    _enforceSizeLimit(force = false) {
        let totalSize = this.getTotalSize();
        if (!force && totalSize < this.maxSizeBytes) {
            return;
        }

        console.log(`Current cache size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds limit. Enforcing LRU eviction...`);

        // Gather all items from all indexes
        let allItems = [];
        const allIndexKeys = Object.keys(localStorage).filter(k => k.startsWith(`${this.prefix}_index_`));
        
        allIndexKeys.forEach(indexKey => {
            const cacheType = indexKey.replace(`${this.prefix}_index_`, '');
            const index = this._getCacheIndex(cacheType);
            Object.keys(index).forEach(key => {
                allItems.push({
                    cacheType,
                    key,
                    lastUsed: index[key].lastUsed,
                    size: index[key].size
                });
            });
        });

        // Sort by least recently used
        allItems.sort((a, b) => a.lastUsed - b.lastUsed);

        // Evict items until size is below the limit
        while (totalSize > this.maxSizeBytes && allItems.length > 0) {
            const itemToEvict = allItems.shift();
            if (itemToEvict) {
                console.log(`Evicting '${itemToEvict.key}' (last used: ${new Date(itemToEvict.lastUsed).toISOString()})`);
                this.remove(itemToEvict.cacheType, itemToEvict.key);
                totalSize -= itemToEvict.size;
                this.stats.evictions++;
            }
        }
    }
    
    /**
     * Calculates the total size of all managed cache items.
     * @returns {number} The total size in bytes.
     */
    getTotalSize() {
        let totalSize = 0;
        const allIndexKeys = Object.keys(localStorage).filter(k => k.startsWith(`${this.prefix}_index_`));
        
        allIndexKeys.forEach(indexKey => {
            const cacheType = indexKey.replace(`${this.prefix}_index_`, '');
            const index = this._getCacheIndex(cacheType);
            totalSize += Object.values(index).reduce((sum, item) => sum + (item.size || 0), 0);
        });
        
        return totalSize;
    }

    /**
     * Returns statistics about cache usage.
     * @returns {object} An object containing cache stats.
     */
    getStats() {
        const totalSizeMB = (this.getTotalSize() / 1024 / 1024).toFixed(2);
        return {
            ...this.stats,
            totalSizeMB,
            maxSizeMB: (this.maxSizeBytes / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Clears one or all caches managed by this instance.
     * @param {string|null} cacheType - The specific cache to clear, or null to clear all.
     */
    clear(cacheType = null) {
        if (cacheType) {
            const index = this._getCacheIndex(cacheType);
            Object.keys(index).forEach(key => this.remove(cacheType, key));
            localStorage.removeItem(`${this.prefix}_index_${cacheType}`);
            console.log(`Cache '${cacheType}' cleared.`);
        } else {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            console.log("All caches cleared.");
        }
    }
}

// Enhanced Cache Manager with localStorage
class EnhancedCacheManager {
    constructor(prefix = 'dvd_cache_', ttlHours = 24) {
        this.prefix = prefix;
        this.ttl = ttlHours * 60 * 60 * 1000; // Convert to milliseconds
    }

    // Store data with timestamp
    set(category, key, data) {
        const cacheKey = `${this.prefix}${category}_${key}`;
        const cacheData = {
            data: data,
            timestamp: Date.now(),
            ttl: this.ttl
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`💾 Cached ${category}:${key}`);
        } catch (error) {
            console.warn('localStorage full, clearing old cache:', error);
            this.clearOldCache();
            // Try again after clearing
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
                console.error('Still cannot cache after clearing:', e);
            }
        }
    }

    // Get data if not expired
    get(category, key) {
        const cacheKey = `${this.prefix}${category}_${key}`;
        
        try {
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            const now = Date.now();
            
            // Check if expired
            if (now - cacheData.timestamp > cacheData.ttl) {
                localStorage.removeItem(cacheKey);
                console.log(`🗑️ Expired cache removed: ${category}:${key}`);
                return null;
            }

            console.log(`✅ Cache hit: ${category}:${key}`);
            return cacheData.data;
        } catch (error) {
            console.error('Cache read error:', error);
            localStorage.removeItem(cacheKey);
            return null;
        }
    }

    // Clear old cache entries
    clearOldCache() {
        const now = Date.now();
        let cleared = 0;
        
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (now - cached.timestamp > cached.ttl) {
                        localStorage.removeItem(key);
                        cleared++;
                    }
                } catch (e) {
                    // Invalid cache entry, remove it
                    localStorage.removeItem(key);
                    cleared++;
                }
            }
        }
        
        console.log(`🧹 Cleared ${cleared} old cache entries`);
    }
}


const CachedFirestore = {
    // Cache instances for different data types
    movieCache: null,
    userCache: null,

    
    // Initialize caches
    init() {
        this.movieCache = new CacheManager('movie_cache_', 50, 2); // 2 hour cache for movies
        this.userCache = new CacheManager('user_cache_', 20, 1); // 1 hour cache for users
        console.log('🔥 CachedFirestore initialized');
    },

    // Get movie by TMDB ID with caching
    async getMovieByTmdbId(tmdbId) {
        // Check cache first
        const cached = MovieCache.getCachedMovieByTmdbId(tmdbId);
        if (cached) {
            console.log(`🎬 Using cached movie for TMDB ID: ${tmdbId}`);
            return { exists: true, data: () => cached, id: cached.firestoreId };
        }

        // Not in cache, query Firestore
        console.log(`🔍 Firestore query for TMDB ID: ${tmdbId}`);
        const query = await db.collection('movies')
            .where('tmdbId', '==', parseInt(tmdbId))
            .limit(1)
            .get();

        if (!query.empty) {
            const doc = query.docs[0];
            const data = doc.data();
            data.firestoreId = doc.id; // Store the document ID
            
            // Cache for next time
            MovieCache.cacheMovieByTmdbId(tmdbId, data);
            MovieCache.cacheMovieByDocId(doc.id, data);
            
            return doc;
        }

        return null;
    },

    /**
     * Invalidate all cached data for a specific movie
     * @param {string} movieId - The Firestore document ID of the movie
     * @param {number|null} tmdbId - Optional TMDB ID if known
     */
    invalidateMovie(movieId, tmdbId = null) {
        console.log(`🗑️ Invalidating cache for movie: ${movieId}`);
        
        // Remove from primary movie cache
        if (this.movieCache) {
            this.movieCache.remove('movies', `doc_${movieId}`);
            
            // Also remove TMDB cache if ID is provided
            if (tmdbId) {
                this.movieCache.remove('movies', `tmdb_${tmdbId}`);
            }
        }
        
        // Remove from MovieCache system
        MovieCache.invalidateMovie(movieId, tmdbId);
        
        // Remove any user interaction caches for this movie
        this.invalidateMovieInteractions(movieId);
        
        console.log(`✅ Cache invalidated for movie: ${movieId}`);
    },

    /**
     * Invalidate user interaction caches for a specific movie
     * @param {string} movieId - The movie ID
     */
    invalidateMovieInteractions(movieId) {
        // Clear user interaction caches
        if (this.userCache) {
            // We need to find and remove all interaction caches for this movie
            // Since we don't know all user IDs, we'll clear by pattern matching
            const allCacheKeys = Object.keys(localStorage).filter(key => 
                key.startsWith(this.userCache.prefix) && key.includes('interaction') && key.includes(movieId)
            );
            
            allCacheKeys.forEach(key => {
                localStorage.removeItem(key);
            });
        }
        
        // Also clear from MovieCache interaction system
        MovieCache.invalidateMovieInteractions(movieId);
    },

    /**
     * Invalidate cache when a movie is updated with new TMDB data
     * @param {string} oldMovieId - The old movie document ID
     * @param {string} newMovieId - The new movie document ID  
     * @param {number} newTmdbId - The new TMDB ID
     */
    invalidateMovieReplacement(oldMovieId, newMovieId, newTmdbId) {
        console.log(`🔄 Handling movie replacement: ${oldMovieId} -> ${newMovieId}`);
        
        // Invalidate old movie
        this.invalidateMovie(oldMovieId);
        
        // Invalidate new movie (in case it was already cached)
        this.invalidateMovie(newMovieId, newTmdbId);
    },

    // Get movie by document ID with caching
    async getMovieByDocId(docId) {
        // Check cache first
        const cached = MovieCache.getCachedMovieByDocId(docId);
        if (cached) {
            console.log(`🎬 Using cached movie for doc ID: ${docId}`);
            return { exists: true, data: () => cached, id: docId };
        }

        // Not in cache, query Firestore
        console.log(`🔍 Firestore query for doc ID: ${docId}`);
        const doc = await db.collection('movies').doc(docId).get();

        if (doc.exists) {
            const data = doc.data();
            data.firestoreId = doc.id;
            
            // Cache for next time
            MovieCache.cacheMovieByDocId(docId, data);
            if (data.tmdbId) {
                MovieCache.cacheMovieByTmdbId(data.tmdbId, data);
            }
            
            return doc;
        }

        return null;
    },

    // Get user interaction with caching
    async getUserInteraction(userId, movieId) {
        // Check cache first
        const cached = MovieCache.getCachedUserInteraction(userId, movieId);
        if (cached) {
            console.log(`👤 Using cached interaction: ${userId}/${movieId}`);
            return { exists: true, data: () => cached };
        }

        // Not in cache, query Firestore
        console.log(`🔍 Firestore query for interaction: ${userId}/${movieId}`);
        const doc = await db.collection('users').doc(userId)
            .collection('movieInteractions').doc(movieId).get();

        if (doc.exists) {
            const data = doc.data();
            
            // Cache for next time
            MovieCache.cacheUserInteraction(userId, movieId, data);
            
            return doc;
        }

        return null;
    },
    /**
     * Cache movie data manually (useful when creating new movies)
     */
    cacheMovie(movieId, movieData, tmdbId = null) {
        // Cache by document ID
        this.movieCache.set('movies', `doc_${movieId}`, movieData);
        
        // Also cache by TMDB ID if available
        if (tmdbId) {
            const dataWithFirestoreId = { firestoreId: movieId, ...movieData };
            this.movieCache.set('movies', `tmdb_${tmdbId}`, dataWithFirestoreId);
        }
        
        console.log(`💾 Manually cached movie: ${movieId}`);
    },

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            movieCache: this.movieCache?.getStats(),
            userCache: this.userCache?.getStats()
        };
    },
}

// ===== MOVIE DATA CACHING =====
// Cache Firestore movie queries to avoid repeated reads

const MovieCache = {
    cache: new EnhancedCacheManager('movie_', 48), // 48 hour cache for movies
    
    // Cache a movie by TMDB ID
    cacheMovieByTmdbId(tmdbId, movieData) {
        if (tmdbId && movieData) {
            this.cache.set('tmdb', tmdbId.toString(), movieData);
        }
    },

    // Get cached movie by TMDB ID
    getCachedMovieByTmdbId(tmdbId) {
        if (!tmdbId) return null;
        return this.cache.get('tmdb', tmdbId.toString());
    },

    // Cache movie by Firestore document ID
    cacheMovieByDocId(docId, movieData) {
        if (docId && movieData) {
            this.cache.set('doc', docId, movieData);
        }
    },

    // Get cached movie by Firestore document ID  
    getCachedMovieByDocId(docId) {
        if (!docId) return null;
        return this.cache.get('doc', docId);
    },

    // Cache user interaction data
    cacheUserInteraction(userId, movieId, interactionData) {
        const key = `${userId}_${movieId}`;
        this.cache.set('interaction', key, interactionData);
    },

    // Get cached user interaction
    getCachedUserInteraction(userId, movieId) {
        const key = `${userId}_${movieId}`;
        return this.cache.get('interaction', key);
    },

       /**
     * Invalidate all cached data for a specific movie
     * @param {string} movieId - The Firestore document ID
     * @param {number|null} tmdbId - Optional TMDB ID if known
     */
    invalidateMovie(movieId, tmdbId = null) {
        console.log(`🗑️ MovieCache: Invalidating movie ${movieId}`);
        
        // Remove by document ID
        if (movieId) {
            this.cache.clearOldCache(); // This will remove expired entries
            
            // Remove specific entries
            const docKey = `movie_doc_${movieId}`;
            const tmdbKey = tmdbId ? `movie_tmdb_${tmdbId}` : null;
            
            // Clear localStorage entries manually since we know the patterns
            Object.keys(localStorage).forEach(key => {
                if (key.includes(`doc_${movieId}`) || 
                    (tmdbId && key.includes(`tmdb_${tmdbId}`))) {
                    localStorage.removeItem(key);
                    console.log(`🗑️ Removed cache key: ${key}`);
                }
            });
        }
    },

    /**
     * Invalidate user interaction caches for a movie
     * @param {string} movieId - The movie ID
     */
    invalidateMovieInteractions(movieId) {
        console.log(`🗑️ MovieCache: Invalidating interactions for movie ${movieId}`);
        
        // Remove all interaction caches that include this movie ID
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('movie_interaction_') && key.includes(movieId)) {
                localStorage.removeItem(key);
                console.log(`🗑️ Removed interaction cache: ${key}`);
            }
        });
    },

    /**
     * Clear all movie-related caches (useful for development/debugging)
     */
    clearAllMovieCache() {
        console.log('🧹 Clearing all movie caches');
        
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('movie_')) {
                localStorage.removeItem(key);
            }
        });
        
        console.log('✅ All movie caches cleared');
    },
};

// Development mode detection
const isDevelopment = 
    window.location.hostname === 'localhost' || 
    window.location.hostname.includes('vercel.app') ||
    window.location.search.includes('dev=true');


// ===== DEVELOPMENT HELPERS =====

const DevHelpers= {
    // Cache statistics
    getCacheStats() {
        let totalItems = 0;
        let totalSize = 0;
        const categories = {};
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('dvd_cache_')) {
                const category = key.split('_')[2];
                categories[category] = (categories[category] || 0) + 1;
                totalItems++;
                
                try {
                    totalSize += localStorage.getItem(key).length;
                } catch (e) {
                    // Skip invalid entries
                }
            }
        }
        
        return {
            totalItems,
            totalSize: Math.round(totalSize / 1024) + ' KB',
            categories,
            quota: Math.round((totalSize / (5 * 1024 * 1024)) * 100) + '% of 5MB localStorage quota'
        };
    },

    // Clear all cache
    clearAllCache() {
        let cleared = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('dvd_cache_')) {
                localStorage.removeItem(key);
                cleared++;
            }
        }
        console.log(`🧹 Cleared all cache (${cleared} items)`);
    }
}

const EnhancedDevHelpers= {
    // Cache statistics
    getAllCacheStats() {
        const stats = {
            movies: 0,
            tmdb: 0,
            upc: 0,
            lists: 0,
            dashboard: 0,
            other: 0,
            totalSize: 0
        };
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            stats.totalSize += value.length;
            
            if (key.startsWith('dvd_cache_movie_')) stats.movies++;
            else if (key.startsWith('tmdb_search_')) stats.tmdb++;
            else if (key.startsWith('upc_')) stats.upc++;
            else if (key.startsWith('list_')) stats.lists++;
            else if (key.startsWith('dashboard_')) stats.dashboard++;
            else stats.other++;
        }
        
        stats.totalSize = Math.round(stats.totalSize / 1024) + ' KB';
        return stats;
    },

    // Skip Firestore reads in development
    enableFirestoreSkipping() {
        window.SKIP_FIRESTORE_READS = true;
        console.log('🚧 Development mode: Firestore reads disabled');
    },
    clearTMDBCache() {
        let cleared = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tmdb_search_')) {
                localStorage.removeItem(key);
                cleared++;
            }
        }
        console.log(`🎬 Cleared ${cleared} TMDB cache entries`);
    },
    
    clearUPCCache() {
        let cleared = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('upc_')) {
                localStorage.removeItem(key);
                cleared++;
            }
        }
        console.log(`📦 Cleared ${cleared} UPC cache entries`);
    },

    /**
     * Manually invalidate a specific movie's cache
     * @param {string} movieId - The movie document ID
     * @param {number|null} tmdbId - Optional TMDB ID
     */
    invalidateMovieCache(movieId, tmdbId = null) {
        console.log(`🛠️ DEV: Manually invalidating cache for movie ${movieId}`);
        
        if (window.CachedFirestore && typeof window.CachedFirestore.invalidateMovie === 'function') {
            window.CachedFirestore.invalidateMovie(movieId, tmdbId);
        }
        
        if (window.MovieCache && typeof window.MovieCache.invalidateMovie === 'function') {
            window.MovieCache.invalidateMovie(movieId, tmdbId);
        }
        
        console.log('✅ DEV: Cache invalidation complete');
    },

    /**
     * Show all cached movies
     */
    showCachedMovies() {
        const movieCaches = [];
        
        Object.keys(localStorage).forEach(key => {
            if (key.includes('movie_') && (key.includes('doc_') || key.includes('tmdb_'))) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    movieCaches.push({
                        key,
                        title: data.data?.title || data.title || 'Unknown',
                        cached: new Date(data.timestamp || Date.now()).toLocaleString()
                    });
                } catch (e) {
                    movieCaches.push({
                        key,
                        title: 'Invalid Cache Entry',
                        cached: 'Unknown'
                    });
                }
            }
        });
        
        console.table(movieCaches);
        return movieCaches;
    },

      async preloadPopularMovies() {
        console.log('🚀 Preloading popular movies...');
        const popularTitles = [
            'The Matrix', 'Inception', 'The Dark Knight', 'Pulp Fiction',
            'Fight Club', 'Forrest Gump', 'The Godfather', 'Goodfellas'
        ];
        
        for (const title of popularTitles) {
            try {
                await MediaLookupUtils.searchTMDBForTitle(title);
                console.log(`✅ Preloaded: ${title}`);
            } catch (e) {
                console.log(`❌ Failed to preload: ${title}`);
            }
        }
        console.log('✅ Preloading complete!');
    }
};

// ===== AUTO-INITIALIZATION =====

if (isDevelopment) {
    console.log('🔧 Development mode detected - Enhanced caching enabled');
    
    // Show cache stats every 30 seconds in dev
    setInterval(() => {
        const stats = DevHelpers.getCacheStats();
        console.log('📊 Cache Stats:', stats);
    }, 30000);
    
    // Make dev helpers available in console
    window.DevHelpers = EnhancedDevHelpers;
    
    console.log('🛠️ Dev tools available: DevHelpers, MovieCache, CachedFirestore');
}

// Initialize when page loads and make globally available
if (typeof window !== 'undefined') {
    window.ScannerManager = ScannerManager;
    window.CachedFirestore = CachedFirestore;
    window.CacheManager = CacheManager;

    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CachedFirestore.init());
    } else {
        CachedFirestore.init();
    }

    // Make MovieCache available globally
    window.MovieCache = MovieCache;
}


