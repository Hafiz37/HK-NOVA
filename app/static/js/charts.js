// HK-NOVA Charts - ApexCharts Initialization & Configuration
// Version: 2.0

// Global chart theme configuration
const chartTheme = {
    theme: {
        mode: 'dark',
        palette: 'palette1'
    },
    chart: {
        background: 'transparent',
        foreColor: '#cbd5e1',
        fontFamily: 'Inter, sans-serif',
        toolbar: {
            show: true,
            tools: {
                download: true,
                selection: false,
                zoom: false,
                zoomin: false,
                zoomout: false,
                pan: false,
                reset: false
            }
        },
        animations: {
            enabled: true,
            easing: 'easeinout',
            speed: 800
        }
    },
    colors: ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'],
    grid: {
        borderColor: '#334155',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } }
    },
    dataLabels: {
        enabled: false
    },
    stroke: {
        curve: 'smooth',
        width: 3
    },
    tooltip: {
        theme: 'dark',
        style: { fontSize: '12px' },
        x: { show: true },
        y: {
            formatter: function(val) {
                return val;
            }
        }
    },
    legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '13px',
        labels: { colors: '#cbd5e1' }
    },
    xaxis: {
        labels: {
            style: { colors: '#94a3b8', fontSize: '11px' }
        },
        axisBorder: { color: '#334155' },
        axisTicks: { color: '#334155' }
    },
    yaxis: {
        labels: {
            style: { colors: '#94a3b8', fontSize: '11px' }
        }
    }
};

// Backup Trend Chart (Area Chart)
async function initBackupTrendChart(days = 30) {
    try {
        const response = await fetch(`/api/v1/analytics/backup-trend?days=${days}`);
        const result = await response.json();
        
        const dates = result.data.map(d => d.date);
        const successData = result.data.map(d => d.success);
        const failedData = result.data.map(d => d.failed);
        
        const options = {
            ...chartTheme,
            series: [
                { name: 'Success', data: successData },
                { name: 'Failed', data: failedData }
            ],
            chart: {
                ...chartTheme.chart,
                type: 'area',
                height: 300,
                stacked: false
            },
            xaxis: {
                ...chartTheme.xaxis,
                categories: dates,
                type: 'datetime'
            },
            yaxis: {
                ...chartTheme.yaxis,
                title: { text: 'Backups', style: { color: '#cbd5e1' } }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.6,
                    opacityTo: 0.1,
                    stops: [0, 90, 100]
                }
            }
        };
        
        const chart = new ApexCharts(document.querySelector("#backup-trend-chart"), options);
        chart.render();
        
        return chart;
    } catch (error) {
        console.error('Error loading backup trend chart:', error);
        showChartError('backup-trend-chart');
    }
}

// Device Status Chart (Donut Chart)
async function initDeviceStatusChart() {
    try {
        const response = await fetch('/api/v1/analytics/device-status');
        const data = await response.json();
        
        const options = {
            ...chartTheme,
            series: [data.healthy, data.errors, data.disabled],
            labels: ['Healthy', 'Errors', 'Disabled'],
            chart: {
                ...chartTheme.chart,
                type: 'donut',
                height: 300
            },
            colors: ['#10b981', '#ef4444', '#64748b'],
            plotOptions: {
                pie: {
                    donut: {
                        size: '65%',
                        labels: {
                            show: true,
                            name: { show: true, fontSize: '14px' },
                            value: { show: true, fontSize: '24px', fontWeight: 600 },
                            total: {
                                show: true,
                                label: 'Total Devices',
                                fontSize: '14px',
                                color: '#cbd5e1',
                                formatter: function() { return data.total; }
                            }
                        }
                    }
                }
            },
            dataLabels: {
                enabled: true,
                style: { fontSize: '13px', fontWeight: 600 }
            }
        };
        
        const chart = new ApexCharts(document.querySelector("#device-status-chart"), options);
        chart.render();
        
        return chart;
    } catch (error) {
        console.error('Error loading device status chart:', error);
        showChartError('device-status-chart');
    }
}

// Group Performance Chart (Bar Chart)
async function initGroupPerformanceChart(days = 30) {
    try {
        const response = await fetch(`/api/v1/analytics/group-performance?days=${days}`);
        const result = await response.json();
        
        const groups = result.data.map(d => d.group);
        const successRates = result.data.map(d => d.success_rate);
        
        const options = {
            ...chartTheme,
            series: [{
                name: 'Success Rate (%)',
                data: successRates
            }],
            chart: {
                ...chartTheme.chart,
                type: 'bar',
                height: 300
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    borderRadius: 6,
                    dataLabels: { position: 'top' }
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) { return val + '%'; },
                offsetX: 30,
                style: { fontSize: '12px', colors: ['#fff'] }
            },
            xaxis: {
                ...chartTheme.xaxis,
                categories: groups,
                max: 100
            },
            yaxis: {
                ...chartTheme.yaxis,
                title: { text: 'Groups', style: { color: '#cbd5e1' } }
            },
            colors: ['#6366f1']
        };
        
        const chart = new ApexCharts(document.querySelector("#group-performance-chart"), options);
        chart.render();
        
        return chart;
    } catch (error) {
        console.error('Error loading group performance chart:', error);
        showChartError('group-performance-chart');
    }
}

// Storage Usage Chart (Bar Chart)
async function initStorageUsageChart() {
    try {
        const response = await fetch('/api/v1/analytics/storage-usage');
        const result = await response.json();
        
        const destinations = result.data.map(d => d.destination);
        const sizes = result.data.map(d => d.total_size_mb);
        
        const options = {
            ...chartTheme,
            series: [{
                name: 'Storage (MB)',
                data: sizes
            }],
            chart: {
                ...chartTheme.chart,
                type: 'bar',
                height: 300
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    borderRadius: 6,
                    columnWidth: '60%',
                    dataLabels: { position: 'top' }
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function(val) { return val.toFixed(1) + ' MB'; },
                offsetY: -20,
                style: { fontSize: '11px', colors: ['#cbd5e1'] }
            },
            xaxis: {
                ...chartTheme.xaxis,
                categories: destinations
            },
            yaxis: {
                ...chartTheme.yaxis,
                title: { text: 'Storage (MB)', style: { color: '#cbd5e1' } }
            },
            colors: ['#3b82f6']
        };
        
        const chart = new ApexCharts(document.querySelector("#storage-usage-chart"), options);
        chart.render();
        
        return chart;
    } catch (error) {
        console.error('Error loading storage usage chart:', error);
        showChartError('storage-usage-chart');
    }
}

// Reliability Score Gauge (Radial Bar)
async function initReliabilityGauge(days = 30) {
    try {
        const response = await fetch(`/api/v1/analytics/reliability-score?days=${days}`);
        const data = await response.json();
        
        const options = {
            ...chartTheme,
            series: [data.overall_score],
            chart: {
                ...chartTheme.chart,
                type: 'radialBar',
                height: 280
            },
            plotOptions: {
                radialBar: {
                    startAngle: -135,
                    endAngle: 135,
                    hollow: {
                        size: '65%',
                        background: '#1e293b'
                    },
                    track: {
                        background: '#334155',
                        strokeWidth: '100%'
                    },
                    dataLabels: {
                        name: {
                            show: true,
                            fontSize: '14px',
                            color: '#cbd5e1',
                            offsetY: -10
                        },
                        value: {
                            fontSize: '32px',
                            fontWeight: 700,
                            color: '#f1f5f9',
                            offsetY: 10,
                            formatter: function(val) { return val.toFixed(1) + '%'; }
                        }
                    }
                }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'horizontal',
                    shadeIntensity: 0.5,
                    gradientToColors: ['#10b981'],
                    inverseColors: false,
                    opacityFrom: 1,
                    opacityTo: 1,
                    stops: [0, 100]
                }
            },
            stroke: { lineCap: 'round' },
            labels: ['Reliability Score']
        };
        
        const chart = new ApexCharts(document.querySelector("#reliability-gauge"), options);
        chart.render();
        
        return chart;
    } catch (error) {
        console.error('Error loading reliability gauge:', error);
        showChartError('reliability-gauge');
    }
}

// Helper: Show error message in chart container
function showChartError(chartId) {
    const container = document.getElementById(chartId);
    if (container) {
        container.innerHTML = `
            <div class="chart-error">
                <i class="bi bi-exclamation-triangle text-danger"></i>
                <p class="text-muted mt-2 mb-0">Failed to load chart data</p>
            </div>
        `;
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.minHeight = '200px';
    }
}

// Export functions for use in dashboard
window.HKNovaCharts = {
    initBackupTrendChart,
    initDeviceStatusChart,
    initGroupPerformanceChart,
    initStorageUsageChart,
    initReliabilityGauge
};
