// HK-NOVA Dashboard Enhancements
// Version: 2.0

document.addEventListener('DOMContentLoaded', function() {
    if (!document.getElementById('dashboard-page')) return;
    
    // Initialize all charts if available
    if (typeof ApexCharts !== 'undefined' && window.HKNovaCharts) {
        initializeCharts();
    }
    
    // Animated number counters
    initNumberCounters();
    
    // Auto-refresh dashboard every 30 seconds
    setInterval(refreshDashboardStats, 30000);
});

// Initialize all charts
function initializeCharts() {
    // Backup Trend Chart
    if (document.getElementById('backup-trend-chart')) {
        window.HKNovaCharts.initBackupTrendChart(30);
    }
    
    // Device Status Chart
    if (document.getElementById('device-status-chart')) {
        window.HKNovaCharts.initDeviceStatusChart();
    }
    
    // Group Performance Chart
    if (document.getElementById('group-performance-chart')) {
        window.HKNovaCharts.initGroupPerformanceChart(30);
    }
    
    // Storage Usage Chart
    if (document.getElementById('storage-usage-chart')) {
        window.HKNovaCharts.initStorageUsageChart();
    }
    
    // Reliability Gauge
    if (document.getElementById('reliability-gauge')) {
        window.HKNovaCharts.initReliabilityGauge(30);
    }
}

// Animated number counters for stat cards
function initNumberCounters() {
    const statValues = document.querySelectorAll('.stat-value[data-value]');
    
    statValues.forEach(function(el) {
        const target = parseInt(el.getAttribute('data-value'));
        if (isNaN(target)) return;
        
        let current = 0;
        const increment = target / 50;
        const duration = 1000;
        const stepTime = duration / 50;
        
        const timer = setInterval(function() {
            current += increment;
            if (current >= target) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = Math.floor(current);
            }
        }, stepTime);
    });
}

// Refresh dashboard stats via HTMX
function refreshDashboardStats() {
    const recentBackupsTable = document.getElementById('recent-backups-table');
    if (recentBackupsTable && typeof htmx !== 'undefined') {
        htmx.trigger(recentBackupsTable, 'refresh');
    }
}

// Chart time range selector handler
function changeChartTimeRange(days, btnElement) {
    document.querySelectorAll('.chart-time-selector .btn-time').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (btnElement) {
        btnElement.classList.add('active');
    }
    
    if (window.HKNovaCharts) {
        if (document.getElementById('backup-trend-chart')) {
            document.getElementById('backup-trend-chart').innerHTML = '';
            window.HKNovaCharts.initBackupTrendChart(days);
        }
        
        if (document.getElementById('group-performance-chart')) {
            document.getElementById('group-performance-chart').innerHTML = '';
            window.HKNovaCharts.initGroupPerformanceChart(days);
        }
        
        if (document.getElementById('reliability-gauge')) {
            document.getElementById('reliability-gauge').innerHTML = '';
            window.HKNovaCharts.initReliabilityGauge(days);
        }
    }
}

// Export for global access
window.DashboardUtils = {
    changeChartTimeRange
};
