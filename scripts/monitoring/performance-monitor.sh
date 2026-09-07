#!/bin/bash

# Performance Monitoring Script
# Collects real-time metrics during load testing

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

OUTPUT_DIR="${1:-./performance-metrics}"
INTERVAL="${2:-5}"  # seconds

mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}📊 Performance Monitoring Started${NC}"
echo "   Output: $OUTPUT_DIR"
echo "   Interval: ${INTERVAL}s"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOGFILE="$OUTPUT_DIR/monitoring_${TIMESTAMP}.log"

# Trap to handle Ctrl+C
trap ctrl_c INT
function ctrl_c() {
    echo -e "\n${YELLOW}Stopping monitoring...${NC}"
    generate_report
    exit 0
}

# Generate summary report
generate_report() {
    local report_file="$OUTPUT_DIR/report_${TIMESTAMP}.txt"
    
    echo "Generating performance report..."
    
    {
        echo "=========================================="
        echo "Performance Monitoring Report"
        echo "=========================================="
        echo "Started: $(head -1 "$LOGFILE" | awk '{print $1, $2}')"
        echo "Ended: $(tail -1 "$LOGFILE" | awk '{print $1, $2}')"
        echo ""
        
        echo "--- CPU Usage Summary ---"
        grep "CPU:" "$LOGFILE" | awk '{sum+=$2; count++} END {print "Average: " sum/count "%"}'
        grep "CPU:" "$LOGFILE" | awk '{if(NR==1 || $2>max) max=$2} END {print "Peak: " max "%"}'
        echo ""
        
        echo "--- Memory Usage Summary ---"
        grep "Memory:" "$LOGFILE" | awk '{sum+=$2; count++} END {print "Average: " sum/count " GB"}'
        grep "Memory:" "$LOGFILE" | awk '{if(NR==1 || $2>max) max=$2} END {print "Peak: " max " GB"}'
        echo ""
        
        echo "--- Database Connections ---"
        grep "DB Connections:" "$LOGFILE" | awk '{sum+=$3; count++} END {print "Average: " sum/count}'
        grep "DB Connections:" "$LOGFILE" | awk '{if(NR==1 || $3>max) max=$3} END {print "Peak: " max}'
        echo ""
        
        echo "=========================================="
        
    } | tee "$report_file"
    
    echo -e "${GREEN}Report saved: $report_file${NC}"
}

# Main monitoring loop
{
    echo "$(date -Iseconds) Monitoring started"
    
    while true; do
        TIMESTAMP=$(date -Iseconds)
        
        # CPU usage
        CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        
        # Memory usage (in GB)
        MEM_USAGE=$(free -g | awk 'NR==2{printf "%.2f", $3}')
        MEM_TOTAL=$(free -g | awk 'NR==2{printf "%.2f", $2}')
        
        # Database connections (if MySQL)
        if command -v mysql &> /dev/null; then
            DB_CONN=$(mysql -u root -p"${MYSQL_ROOT_PASSWORD:-}" -e "SHOW STATUS LIKE 'Threads_connected';" 2>/dev/null | awk 'NR==2{print $2}' || echo "N/A")
        else
            DB_CONN="N/A"
        fi
        
        # Process count
        PROC_COUNT=$(ps aux | wc -l)
        
        # Network connections
        NET_CONN=$(ss -s | grep "TCP:" | awk '{print $2}')
        
        # Disk I/O
        if command -v iostat &> /dev/null; then
            DISK_IO=$(iostat -x 1 2 | tail -n +4 | awk 'NR==1{print $14}')
        else
            DISK_IO="N/A"
        fi
        
        # Log data
        echo "$TIMESTAMP CPU: $CPU_USAGE% Memory: $MEM_USAGE/$MEM_TOTAL GB DB Connections: $DB_CONN Processes: $PROC_COUNT Network: $NET_CONN Disk: ${DISK_IO}%"
        
        # Display on screen
        clear
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Performance Monitoring${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        echo -e "⏰ Time: $TIMESTAMP"
        echo ""
        echo -e "💻 CPU Usage:        ${YELLOW}$CPU_USAGE%${NC}"
        echo -e "🧠 Memory:           ${YELLOW}$MEM_USAGE GB${NC} / $MEM_TOTAL GB"
        echo -e "🔌 DB Connections:   ${YELLOW}$DB_CONN${NC}"
        echo -e "⚙️  Processes:        ${YELLOW}$PROC_COUNT${NC}"
        echo -e "🌐 Network Conns:    ${YELLOW}$NET_CONN${NC}"
        echo -e "💾 Disk Util:        ${YELLOW}${DISK_IO}%${NC}"
        echo ""
        echo -e "${BLUE}========================================${NC}"
        echo -e "Press Ctrl+C to stop and generate report"
        
        sleep "$INTERVAL"
    done
    
} | tee "$LOGFILE"
