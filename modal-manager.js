// modal-manager.js

const ModalManager = {
    overlayElement: null,
    onCloseCallback: null,

    /**
     * The main function to display a modal.
     * @param {object} options - Configuration for the modal.
     * @param {string} options.title - The text for the modal's title.
     * @param {string} options.content - The main body content (can be plain text or HTML).
     * @param {Array<object>} [options.buttons=[]] - An array of button configurations.
     * @param {function} [options.onClose=()=>{}] - A callback function when the modal is closed.
     */
    show(options = {}) {
        // Close any existing modal first to prevent overlap
        if (this.overlayElement) {
            this.close();
        }

        const config = {
            title: '',
            content: '',
            buttons: [],
            onClose: () => {},
            ...options,
        };

        this.onCloseCallback = config.onClose;
        
        // Create the modal structure in memory
        this._createBaseStructure(config);

        // Add the new modal to the DOM
        document.body.appendChild(this.overlayElement);
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        // Use a short delay to allow the CSS transition to fire correctly
        requestAnimationFrame(() => {
            this.overlayElement.classList.add('active');
        });
    },

    /**
     * Creates the modal's HTML elements but does not attach them to the DOM.
     * @private
     */
    _createBaseStructure(config) {
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        // Title
        const titleEl = document.createElement('h3');
        titleEl.className = 'modal-title';
        titleEl.textContent = config.title;
        modalContent.appendChild(titleEl);

        // Close Button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.close();
        modalContent.appendChild(closeBtn);

        // Main Content (allows for HTML)
        const contentEl = document.createElement('div');
        contentEl.className = 'modal-body';
        contentEl.innerHTML = config.content;
        modalContent.appendChild(contentEl);

        // Buttons
        if (config.buttons.length > 0) {
            const buttonsEl = document.createElement('div');
            buttonsEl.className = 'modal-buttons';

            config.buttons.forEach(btnConfig => {
                const button = document.createElement('button');
                // Use btnConfig.class for styling (e.g., 'btn-primary') and add a base class
                button.className = `btn ${btnConfig.class || 'btn-secondary'}`;
                button.textContent = btnConfig.text;
                button.onclick = () => {
                    // The button's action can choose whether to close the modal
                    if (btnConfig.onClick) {
                        // Pass the modal's root element to the callback for accessing inputs
                        btnConfig.onClick(contentEl); 
                    }
                    // Most buttons should close the modal
                    if (btnConfig.closes !== false) {
                        this.close();
                    }
                };
                buttonsEl.appendChild(button);
            });
            modalContent.appendChild(buttonsEl);
        }
        
        this.overlayElement.appendChild(modalContent);
        
        // Add listener to close modal on overlay click
        this.overlayElement.addEventListener('click', (e) => {
            if (e.target === this.overlayElement) {
                this.close();
            }
        });
    },

    /**
     * Closes the active modal and cleans up.
     */
    close() {
        if (!this.overlayElement) return;

        // Execute the onClose callback if it exists
        if (this.onCloseCallback) {
            this.onCloseCallback();
            this.onCloseCallback = null;
        }
        
        this.overlayElement.classList.remove('active');
        document.body.style.overflow = 'auto';

        // Remove the element from the DOM after the fade-out transition completes
        this.overlayElement.addEventListener('transitionend', () => {
            if (this.overlayElement && this.overlayElement.parentNode) {
                this.overlayElement.parentNode.removeChild(this.overlayElement);
            }
            this.overlayElement = null;
        }, { once: true });
    },
};