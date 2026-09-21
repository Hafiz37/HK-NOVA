// HK-NOVA Table Enhancements
// Advanced table features: sorting, density, export, filtering

class TableEnhancer {
    constructor(tableId, options = {}) {
        this.table = document.getElementById(tableId);
        if (!this.table) return;
        
        this.options = {
            sortable: options.sortable !== false,
            density: options.density !== false,
            exportable: options.exportable !== false,
            ...options
        };
        
        this.currentDensity = 'comfortable';
        this.sortState = {};
        
        this.init();
    }
    
    init() {
        this.addToolbar();
        
        if (this.options.sortable) {
            this.makeSortable();
        }
    }
    
    addToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'table-toolbar';
        toolbar.innerHTML = `
            <div class="toolbar-left">
                ${this.options.density ? `
                <div class="btn-group">
                    <button class="btn-icon" id="density-compact" title="Compact">
                        <i class="bi bi-list"></i> Compact
                    </button>
                    <button class="btn-icon active" id="density-comfortable" title="Comfortable">
                        <i class="bi bi-list-ul"></i> Comfortable
                    </button>
                    <button class="btn-icon" id="density-spacious" title="Spacious">
                        <i class="bi bi-list-task"></i> Spacious
                    </button>
                </div>
                ` : ''}
                ${this.options.exportable ? `
                <button class="btn-icon" id="export-csv">
                    <i class="bi bi-download"></i> Export CSV
                </button>
                ` : ''}
            </div>
            <div class="toolbar-right">
                <input type="search" class="form-control form-control-sm" placeholder="Filter table..." id="table-filter" style="width: 250px;">
            </div>
        `;
        
        this.table.parentNode.insertBefore(toolbar, this.table);
        
        // Attach event listeners
        if (this.options.density) {
            document.getElementById('density-compact')?.addEventListener('click', () => this.setDensity('compact'));
            document.getElementById('density-comfortable')?.addEventListener('click', () => this.setDensity('comfortable'));
            document.getElementById('density-spacious')?.addEventListener('click', () => this.setDensity('spacious'));
        }
        
        if (this.options.exportable) {
            document.getElementById('export-csv')?.addEventListener('click', () => this.exportCSV());
        }
        
        const filter = document.getElementById('table-filter');
        if (filter) {
            filter.addEventListener('input', (e) => this.filterTable(e.target.value));
        }
    }
    
    makeSortable() {
        const headers = this.table.querySelectorAll('thead th');
        
        headers.forEach((header, index) => {
            if (header.hasAttribute('data-sortable') && header.getAttribute('data-sortable') === 'false') {
                return;
            }
            
            header.classList.add('sortable');
            header.style.cursor = 'pointer';
            
            header.addEventListener('click', () => {
                this.sortColumn(index, header);
            });
        });
    }
    
    sortColumn(columnIndex, header) {
        const tbody = this.table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // Determine sort direction
        let direction = 'asc';
        if (this.sortState[columnIndex] === 'asc') {
            direction = 'desc';
        }
        
        // Clear all sort indicators
        this.table.querySelectorAll('thead th').forEach(h => {
            h.classList.remove('asc', 'desc');
        });
        
        // Set current sort indicator
        header.classList.add(direction);
        this.sortState = { [columnIndex]: direction };
        
        // Sort rows
        rows.sort((a, b) => {
            const aValue = a.cells[columnIndex]?.textContent.trim() || '';
            const bValue = b.cells[columnIndex]?.textContent.trim() || '';
            
            // Try numeric comparison
            const aNum = parseFloat(aValue);
            const bNum = parseFloat(bValue);
            
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            }
            
            // String comparison
            return direction === 'asc' 
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });
        
        // Re-append sorted rows
        rows.forEach(row => tbody.appendChild(row));
    }
    
    setDensity(density) {
        this.table.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
        this.table.classList.add(`density-${density}`);
        this.currentDensity = density;
        
        // Update active button
        document.querySelectorAll('[id^="density-"]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`density-${density}`)?.classList.add('active');
    }
    
    filterTable(query) {
        const tbody = this.table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        const q = query.toLowerCase();
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(q) ? '' : 'none';
        });
    }
    
    exportCSV() {
        const rows = [];
        
        // Headers
        const headers = Array.from(this.table.querySelectorAll('thead th'))
            .map(th => th.textContent.trim());
        rows.push(headers);
        
        // Data rows
        this.table.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.style.display !== 'none') {
                const cells = Array.from(tr.querySelectorAll('td'))
                    .map(td => {
                        // Clean cell content
                        let text = td.textContent.trim();
                        // Remove extra whitespace
                        text = text.replace(/\s+/g, ' ');
                        // Escape quotes
                        text = text.replace(/"/g, '""');
                        return `"${text}"`;
                    });
                rows.push(cells);
            }
        });
        
        // Generate CSV
        const csv = rows.map(row => row.join(',')).join('\n');
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `export-${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Auto-initialize tables with data-enhance attribute
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('table[data-enhance="true"]').forEach(table => {
        new TableEnhancer(table.id, {
            sortable: table.getAttribute('data-sortable') !== 'false',
            density: table.getAttribute('data-density') !== 'false',
            exportable: table.getAttribute('data-exportable') !== 'false'
        });
    });
});

// Export for manual initialization
window.TableEnhancer = TableEnhancer;
