/**
 * SEARCH UI UTILITIES
 */
const SearchUI = {
    // Configuration properties
    config: {
        searchInputId: null,
        searchBtnId: null,
        resultsContainerId: null,
        searchFooterId: null,
        resultCountId: null,
        loadMoreBtnId: null,
        onSelect: () => {}, // Callback for when a media item is selected
    },

    // State properties
    currentPage: 1,
    totalPages: 1,
    totalResults: 0,
    currentQuery: '',
    isLoading: false,

    /**
     * Initializes the search UI on a page.
     * @param {object} config - Configuration object with element IDs and onSelect callback.
     */
    initialize(config) {
        this.config = { ...this.config, ...config };

        const searchInput = document.getElementById(this.config.searchInputId);
        const searchBtn = document.getElementById(this.config.searchBtnId);
        const loadMoreBtn = document.getElementById(this.config.loadMoreBtnId);

        if (!searchInput || !searchBtn || !loadMoreBtn) {
            console.error('SearchUI initialization failed: One or more required elements are missing.');
            return;
        }

        const debouncedSearch = LibraryUtils.ui.debounce((query) => {
            if (query.length > 2) this.performSearch(query, 1);
        }, 300);

        searchInput.addEventListener('input', () => debouncedSearch(searchInput.value.trim()));
        searchBtn.addEventListener('click', () => this.performSearch(searchInput.value.trim(), 1));
        loadMoreBtn.addEventListener('click', () => this.loadMore());
    },

    /**
     * Performs the TMDB search and updates the UI.
     * @param {string} query - The search query.
     * @param {number} page - The page number to fetch.
     */
    async performSearch(query, page) {
        if (!query || this.isLoading) return;

        const isNewSearch = page === 1;
        if (isNewSearch) {
            this.currentQuery = query;
            this.currentPage = 1;
        }

        this.isLoading = true;
        this.updateLoadingState(true, isNewSearch);

        try {
            const searchUrl = `${MediaLookupUtils.TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&page=${page}`;
            const response = await fetch(searchUrl);
            const data = await response.json();

            if (!response.ok) throw new Error('Failed to fetch search results.');

            this.currentPage = data.page;
            this.totalPages = data.total_pages;
            this.totalResults = data.total_results;

            this.displayResults(data.results, isNewSearch);
        } catch (error) {
            console.error('TMDB Search Error:', error);
            const resultsContainer = document.getElementById(this.config.resultsContainerId);
            if (resultsContainer) {
                resultsContainer.innerHTML = '<div class="error-state"><p>Search failed. Please try again.</p></div>';
            }
        } finally {
            this.isLoading = false;
            this.updateLoadingState(false, isNewSearch);
            this.updateSearchFooter();
        }
    },

    /**
     * Displays the search results in the container.
     * @param {Array} results - The array of media items from TMDB.
     * @param {boolean} isNewSearch - Whether this is a new search or loading more.
     */
    displayResults(results, isNewSearch) {
        const resultsContainer = document.getElementById(this.config.resultsContainerId);
        if (!resultsContainer) return;

        if (isNewSearch) resultsContainer.innerHTML = '';

        if (results.length === 0 && isNewSearch) {
            resultsContainer.innerHTML = '<div class="empty-state"><p>No results found.</p></div>';
            return;
        }

        const validResults = results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');

        const resultsHTML = validResults.map(item => {
            const title = item.title || item.name;
            const year = (item.release_date || item.first_air_date || '').substring(0, 4);
            const poster = item.poster_path ? `${MediaLookupUtils.TMDB_IMAGE_BASE}${item.poster_path}` : 'https://placehold.co/50x75/2D194D/DEF0F7?text=N/A';
            const overview = LibraryUtils.ui.truncateText(item.overview, 100);
            const badgeHTML = item.media_type === 'tv' ?
                `<span class="badge badge-tv"><span class="icon icon-tv icon-sm"></span></span>` :
                `<span class="badge badge-movie"><span class="icon icon-movie icon-sm"></span></span>`;

            return `
                <div class="search-result" data-id="${item.id}" data-type="${item.media_type}">
                    <img src="${poster}" class="search-result-poster" loading="lazy">
                    <div class="search-result-info">
                        <h4>${title} (${year}) ${badgeHTML}</h4>
                        <p>${overview}</p>
                    </div>
                </div>
            `;
        }).join('');

        resultsContainer.insertAdjacentHTML('beforeend', resultsHTML);
        this.attachResultClickHandlers(resultsContainer);
    },
    
    /**
     * Attaches click handlers to the search result items.
     * @param {HTMLElement} container - The container with the search results.
     */
    attachResultClickHandlers(container) {
        const results = container.querySelectorAll('.search-result');
        results.forEach(result => {
            // Remove old listeners to prevent duplicates
            result.replaceWith(result.cloneNode(true));
        });
        
        container.querySelectorAll('.search-result').forEach(result => {
            result.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const type = e.currentTarget.dataset.type;
                
                // Call the onSelect callback
                this.config.onSelect(id, type, e.currentTarget);
                
                // Collapse search results after selection
                this.collapseResults();
            });
        });
    },
    /**
     * Collapse search results and clear search input
     */
    collapseResults() {
        const resultsContainer = document.getElementById(this.config.resultsContainerId);
        const searchFooter = document.getElementById(this.config.searchFooterId);
        const searchInput = document.getElementById(this.config.searchInputId);
        
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
        }
        
        if (searchFooter) {
            searchFooter.style.display = 'none';
        }
        
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Reset pagination state
        this.currentPage = 1;
        this.totalPages = 1;
        this.totalResults = 0;
    },

    loadMore() {
        if (this.currentPage < this.totalPages) {
            this.performSearch(this.currentQuery, this.currentPage + 1);
        }
    },

    updateLoadingState(isLoading, isNewSearch) {
        const resultsContainer = document.getElementById(this.config.resultsContainerId);
        const loadMoreBtn = document.getElementById(this.config.loadMoreBtnId);

        if (isNewSearch && isLoading && resultsContainer) {
            resultsContainer.innerHTML = '<div class="loading-container"><div class="loading-spinner" style="display: block;"></div></div>';
        }
        if (loadMoreBtn) {
            loadMoreBtn.textContent = isLoading ? 'Loading...' : 'Load More';
            loadMoreBtn.disabled = isLoading;
        }
    },

    updateSearchFooter() {
        const footer = document.getElementById(this.config.searchFooterId);
        const countSpan = document.getElementById(this.config.resultCountId);
        const loadMoreBtn = document.getElementById(this.config.loadMoreBtnId);

        if (this.totalResults > 0 && footer && countSpan && loadMoreBtn) {
            footer.style.display = 'flex';
            const itemsShown = document.getElementById(this.config.resultsContainerId).children.length;
            countSpan.textContent = `Showing ${itemsShown} of ${this.totalResults} results`;
            loadMoreBtn.style.display = this.currentPage < this.totalPages ? 'block' : 'none';
        } else if (footer) {
            footer.style.display = 'none';
        }
    }
};