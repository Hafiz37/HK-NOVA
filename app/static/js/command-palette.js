// HK-NOVA Command Palette
// Global search and quick actions (Ctrl+K / Cmd+K)

class CommandPalette {
    constructor() {
        this.isOpen = false;
        this.selectedIndex = 0;
        this.results = [];
        
        this.init();
    }
    
    init() {
        // Create palette HTML
        this.createPalette();
        
        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
            
            if (this.isOpen) {
                if (e.key === 'Escape') {
                    this.close();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.selectNext();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.selectPrev();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executeSelected();
                }
            }
        });
        
        // Close on backdrop click
        this.backdrop.addEventListener('click', () => this.close());
        
        // Search input handler
        this.searchInput.addEventListener('input', (e) => {
            this.search(e.target.value);
        });
    }
    
    createPalette() {
        // Backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'command-palette-backdrop';
        document.body.appendChild(this.backdrop);
        
        // Palette container
        this.container = document.createElement('div');
        this.container.className = 'command-palette';
        this.container.innerHTML = `
            <div class="command-palette-search">
                <input type="text" placeholder="Search devices, backups, actions..." id="command-search">
            </div>
            <div class="command-palette-results" id="command-results">
                <div class="command-palette-empty">
                    <i class="bi bi-search"></i>
                    <p>Type to search...</p>
                </div>
            </div>
            <div class="command-palette-footer">
                <span><span class="command-palette-kbd">↑↓</span> Navigate</span>
                <span><span class="command-palette-kbd">↵</span> Select</span>
                <span><span class="command-palette-kbd">Esc</span> Close</span>
            </div>
        `;
        document.body.appendChild(this.container);
        
        this.searchInput = document.getElementById('command-search');
        this.resultsContainer = document.getElementById('command-results');
    }
    
    async search(query) {
        if (!query || query.length < 2) {
            this.showEmpty();
            return;
        }
        
        try {
            const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            this.results = [];
            
            // Add devices
            if (data.devices && data.devices.length > 0) {
                data.devices.forEach(device => {
                    this.results.push({
                        type: 'device',
                        icon: 'router',
                        title: device.hostname,
                        subtitle: `${device.ip_address} - ${device.device_type}`,
                        url: `/devices/${device.id}`
                    });
                });
            }
            
            // Add backups
            if (data.backups && data.backups.length > 0) {
                data.backups.forEach(backup => {
                    this.results.push({
                        type: 'backup',
                        icon: 'archive',
                        title: `Backup: ${backup.device_hostname}`,
                        subtitle: `${backup.timestamp} - ${backup.status}`,
                        url: `/backups/${backup.id}`
                    });
                });
            }
            
            // Add jobs
            if (data.jobs && data.jobs.length > 0) {
                data.jobs.forEach(job => {
                    this.results.push({
                        type: 'job',
                        icon: 'clock-history',
                        title: job.name,
                        subtitle: `Schedule: ${job.cron_expression}`,
                        url: `/jobs/${job.id}/edit`
                    });
                });
            }
            
            // Add quick actions
            if (this.results.length === 0 && query.length > 0) {
                this.results = this.getQuickActions(query);
            }
            
            this.renderResults();
            
        } catch (error) {
            console.error('Search error:', error);
            this.showError();
        }
    }
    
    getQuickActions(query) {
        const actions = [
            { type: 'action', icon: 'plus-lg', title: 'Add Device', subtitle: 'Create a new device', url: '/devices/add' },
            { type: 'action', icon: 'download', title: 'Trigger Backup', subtitle: 'Run backup now', url: '/backups/trigger' },
            { type: 'action', icon: 'clock', title: 'Add Schedule', subtitle: 'Create new backup schedule', url: '/jobs/add' },
            { type: 'action', icon: 'gear', title: 'Settings', subtitle: 'Configure destinations', url: '/destinations' }
        ];
        
        const q = query.toLowerCase();
        return actions.filter(a => 
            a.title.toLowerCase().includes(q) || 
            a.subtitle.toLowerCase().includes(q)
        );
    }
    
    renderResults() {
        if (this.results.length === 0) {
            this.showEmpty('No results found');
            return;
        }
        
        this.selectedIndex = 0;
        
        const html = this.results.map((result, index) => `
            <a href="${result.url}" class="command-palette-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                <i class="bi bi-${result.icon}"></i>
                <div class="command-palette-item-content">
                    <div class="command-palette-item-title">${result.title}</div>
                    <div class="command-palette-item-subtitle">${result.subtitle}</div>
                </div>
            </a>
        `).join('');
        
        this.resultsContainer.innerHTML = html;
        
        // Add click handlers
        this.resultsContainer.querySelectorAll('.command-palette-item').forEach((el, index) => {
            el.addEventListener('mouseenter', () => {
                this.selectedIndex = index;
                this.updateSelection();
            });
            el.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = this.results[index].url;
                this.close();
            });
        });
    }
    
    showEmpty(message = 'Type to search...') {
        this.resultsContainer.innerHTML = `
            <div class="command-palette-empty">
                <i class="bi bi-search"></i>
                <p>${message}</p>
            </div>
        `;
        this.results = [];
    }
    
    showError() {
        this.resultsContainer.innerHTML = `
            <div class="command-palette-empty">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <p>Search failed. Please try again.</p>
            </div>
        `;
    }
    
    selectNext() {
        if (this.results.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
        this.updateSelection();
    }
    
    selectPrev() {
        if (this.results.length === 0) return;
        this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
        this.updateSelection();
    }
    
    updateSelection() {
        this.resultsContainer.querySelectorAll('.command-palette-item').forEach((el, index) => {
            if (index === this.selectedIndex) {
                el.classList.add('selected');
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                el.classList.remove('selected');
            }
        });
    }
    
    executeSelected() {
        if (this.results.length === 0) return;
        const selected = this.results[this.selectedIndex];
        if (selected) {
            window.location.href = selected.url;
            this.close();
        }
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        this.isOpen = true;
        this.backdrop.classList.add('show');
        this.container.classList.add('show');
        this.searchInput.value = '';
        this.searchInput.focus();
        this.showEmpty();
        document.body.style.overflow = 'hidden';
    }
    
    close() {
        this.isOpen = false;
        this.backdrop.classList.remove('show');
        this.container.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    window.commandPalette = new CommandPalette();
});
