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

// Make the CacheManager globally available
if (typeof window !== 'undefined') {
    window.CacheManager = CacheManager;
}
