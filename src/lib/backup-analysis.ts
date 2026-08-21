import type { DiffLine } from './diff';

export type ChangeSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfigChange {
  section: string;
  severity: ChangeSeverity;
  changeType: 'ADD' | 'DELETE' | 'MODIFY';
  lineNumbers: number[];
  patterns: string[];
  riskScore: number; // 0-100
  preview: string; // First 100 chars of changed content
}

export interface ChangesSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalChanges: number;
  riskScore: number; // weighted average
}

// Pattern-based change classification
const CHANGE_PATTERNS: Array<{ pattern: RegExp; severity: ChangeSeverity; weight: number; description: string }> = [
  // CRITICAL: Security & routing
  { pattern: /user\s+\w+\s+password|username\s+\w+\s+privilege/i, severity: 'CRITICAL', weight: 100, description: 'User account modification' },
  { pattern: /enable\s+(secret|password)/i, severity: 'CRITICAL', weight: 100, description: 'Enable password change' },
  { pattern: /ip\s+route|ipv6\s+route/i, severity: 'CRITICAL', weight: 90, description: 'Routing table change' },
  { pattern: /firewall|access-list|acl\s+\d+/i, severity: 'CRITICAL', weight: 90, description: 'Firewall/ACL modification' },
  { pattern: /aaa\s+(authentication|authorization|accounting)/i, severity: 'CRITICAL', weight: 95, description: 'AAA configuration change' },
  { pattern: /radius-server|tacacs-server/i, severity: 'CRITICAL', weight: 95, description: 'RADIUS/TACACS server change' },
  { pattern: /ssh\s+(server|enable)/i, severity: 'CRITICAL', weight: 85, description: 'SSH server config change' },
  { pattern: /snmp-server\s+(community|user|group)/i, severity: 'CRITICAL', weight: 85, description: 'SNMP security config change' },

  // HIGH: Network config
  { pattern: /interface\s+(GigabitEthernet|TenGigabitEthernet|FastEthernet|Ethernet|Port-channel)/i, severity: 'HIGH', weight: 70, description: 'Interface configuration change' },
  { pattern: /vlan\s+\d+|switchport/i, severity: 'HIGH', weight: 65, description: 'VLAN/switchport change' },
  { pattern: /ip\s+address|ipv6\s+address/i, severity: 'HIGH', weight: 70, description: 'IP address change' },
  { pattern: /router\s+(ospf|bgp|eigrp|rip)/i, severity: 'HIGH', weight: 75, description: 'Routing protocol change' },
  { pattern: /qos|policy-map|class-map/i, severity: 'HIGH', weight: 60, description: 'QoS policy change' },
  { pattern: /spanning-tree|stp/i, severity: 'HIGH', weight: 65, description: 'Spanning tree change' },
  { pattern: /vrrp|hsrp|glbp/i, severity: 'HIGH', weight: 70, description: 'FHRP configuration change' },
  { pattern: /port-security|dot1x/i, severity: 'HIGH', weight: 70, description: 'Port security change' },

  // MEDIUM: Management & monitoring
  { pattern: /snmp-server\s+(community|contact|location)/i, severity: 'MEDIUM', weight: 50, description: 'SNMP basic config change' },
  { pattern: /logging|syslog/i, severity: 'MEDIUM', weight: 40, description: 'Logging configuration change' },
  { pattern: /ntp\s+(server|peer|master)/i, severity: 'MEDIUM', weight: 35, description: 'NTP configuration change' },
  { pattern: /banner|hostname/i, severity: 'MEDIUM', weight: 20, description: 'Banner/hostname change' },
  { pattern: /clock\s+timezone|clock\s+summer-time/i, severity: 'MEDIUM', weight: 25, description: 'Timezone change' },
  { pattern: /service\s+(timestamps|password-encryption)/i, severity: 'MEDIUM', weight: 30, description: 'Service configuration change' },

  // LOW: Descriptions & metadata
  { pattern: /description|remark/i, severity: 'LOW', weight: 10, description: 'Description/comment change' },
  { pattern: /!\s*$|#\s*$/i, severity: 'LOW', weight: 5, description: 'Comment line change' },
];

/**
 * Analyze diff lines and classify changes by severity
 */
export function analyzeConfigChanges(diff: DiffLine[]): {
  changes: ConfigChange[];
  summary: ChangesSummary;
} {
  const changes: ConfigChange[] = [];
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalRiskScore = 0;
  let totalChanges = 0;

  // Current section tracking
  let currentSection = 'global';

  diff.forEach((line, index) => {
    // Skip unchanged lines
    if (line.kind === 'same') {
      // Track section headers
      const sectionMatch = line.text.match(/^(interface|router|vlan|policy-map|class-map|access-list|ip\s+access-list)\s+(\S+)/i);
      if (sectionMatch) {
        currentSection = line.text.trim();
      }
      return;
    }

    // Analyze changed lines (add/del)
    const matchedPatterns: Array<{ pattern: string; severity: ChangeSeverity; weight: number; description: string }> = [];
    let maxWeight = 0;
    let severity: ChangeSeverity = 'LOW';

    for (const { pattern, severity: sev, weight, description } of CHANGE_PATTERNS) {
      if (pattern.test(line.text)) {
        matchedPatterns.push({ pattern: pattern.source, severity: sev, weight, description });
        if (weight > maxWeight) {
          maxWeight = weight;
          severity = sev;
        }
      }
    }

    // Default severity if no pattern matched
    if (matchedPatterns.length === 0) {
      severity = 'LOW';
      maxWeight = 10;
    }

    // Record change
    const change: ConfigChange = {
      section: currentSection,
      severity,
      changeType: line.kind === 'add' ? 'ADD' : 'DELETE',
      lineNumbers: [index + 1],
      patterns: matchedPatterns.map(m => m.description),
      riskScore: maxWeight,
      preview: line.text.slice(0, 100),
    };

    changes.push(change);
    severityCounts[severity.toLowerCase() as keyof typeof severityCounts]++;
    totalRiskScore += maxWeight;
    totalChanges++;
  });

  // Calculate weighted average risk score
  const avgRiskScore = totalChanges > 0 ? Math.round(totalRiskScore / totalChanges) : 0;

  return {
    changes,
    summary: {
      ...severityCounts,
      totalChanges,
      riskScore: avgRiskScore,
    },
  };
}

/**
 * Extract critical changes for notification/alerting
 */
export function extractCriticalChanges(changes: ConfigChange[]): ConfigChange[] {
  return changes.filter(c => c.severity === 'CRITICAL' || c.severity === 'HIGH');
}

/**
 * Get severity badge style for UI
 */
export function getSeverityBadgeStyle(severity: ChangeSeverity): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'HIGH':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'MEDIUM':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'LOW':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

/**
 * Get severity icon for UI
 */
export function getSeverityIcon(severity: ChangeSeverity): string {
  switch (severity) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🔵';
    case 'LOW': return '⚪';
  }
}