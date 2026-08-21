import { PrismaClient } from '@prisma/client';
import { getBackupContent } from './backup-storage';
import { analyzeConfigChanges } from './backup-analysis';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';

export interface ComplianceReportOptions {
  startDate: Date;
  endDate: Date;
  deviceIds?: string[];
  format: 'pdf' | 'xlsx';
  includeDetails?: boolean;
}

export interface ComplianceReportData {
  summary: {
    period: string;
    totalDevices: number;
    devicesWithBackups: number;
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    backupCoverage: number;
    successRate: number;
    avgBackupSize: number;
    totalStorageUsed: number;
    criticalChangesCount: number;
    highChangesCount: number;
    devicesNeverBackedUp: number;
  };
  deviceDetails: DeviceCompliance[];
  criticalChanges: CriticalChangeDetail[];
  failedBackups: FailedBackupDetail[];
  storageBreakdown: StorageBreakdown[];
}

export interface DeviceCompliance {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceType: string;
  vendor: string | null;
  backupCount: number;
  lastBackup: Date | null;
  lastBackupStatus: string;
  daysSinceLastBackup: number;
  isCompliant: boolean; // backed up within 7 days
  avgBackupSize: number;
  totalStorageUsed: number;
  criticalChanges: number;
  highChanges: number;
  riskScore: number;
}

export interface CriticalChangeDetail {
  backupId: string;
  deviceName: string;
  deviceIp: string;
  timestamp: Date;
  severity: string;
  section: string;
  preview: string;
  patterns: string[];
}

export interface FailedBackupDetail {
  backupId: string;
  deviceName: string;
  deviceIp: string;
  timestamp: Date;
  errorMessage: string | null;
}

export interface StorageBreakdown {
  storageLocation: string;
  backupCount: number;
  totalSizeMB: number;
  compressedSizeMB: number;
  compressionRatio: number;
}

/**
 * Generate compliance report data
 */
export async function generateComplianceReport(
  prisma: PrismaClient,
  options: ComplianceReportOptions
): Promise<ComplianceReportData> {
  const { startDate, endDate, deviceIds, includeDetails = true } = options;

  const where: any = {
    deletedAt: null,
    timestamp: { gte: startDate, lte: endDate },
  };

  if (deviceIds && deviceIds.length > 0) {
    where.deviceId = { in: deviceIds };
  }

  // Get all backups in period
  const backups = await prisma.backup.findMany({
    where,
    select: {
      id: true,
      deviceId: true,
      timestamp: true,
      status: true,
      errorMessage: true,
      sizeBytes: true,
      compressedBytes: true,
      storageLocation: true,
      riskScore: true,
      changesSummary: true,
      criticalChanges: true,
    },
    orderBy: { timestamp: 'desc' },
  });

  // Get all devices
  const deviceWhere: any = { deletedAt: null };
  if (deviceIds && deviceIds.length > 0) {
    deviceWhere.id = { in: deviceIds };
  }
  const devices = await prisma.device.findMany({
    where: deviceWhere,
    select: { id: true, name: true, ip: true, type: true, vendor: true },
  });
  const deviceMap = new Map(devices.map(d => [d.id, d]));

  // Calculate summary
  const successfulBackups = backups.filter(b => b.status === 'SUCCESS');
  const failedBackups = backups.filter(b => b.status === 'FAILED');
  const devicesWithBackups = new Set(backups.map(b => b.deviceId));
  const totalDevices = devices.length;
  const devicesWithBackupsCount = devicesWithBackups.size;

  // Device compliance details
  const deviceDetails: DeviceCompliance[] = devices.map(device => {
    const deviceBackups = backups.filter(b => b.deviceId === device.id);
    const successfulDeviceBackups = deviceBackups.filter(b => b.status === 'SUCCESS');
    const lastBackup = deviceBackups[0]; // already ordered by timestamp desc
    const daysSinceLastBackup = lastBackup
      ? Math.floor((Date.now() - new Date(lastBackup.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const criticalChanges = deviceBackups.reduce((sum, b) => {
      const cs = b.changesSummary as any;
      return sum + (cs?.critical || 0);
    }, 0);

    const highChanges = deviceBackups.reduce((sum, b) => {
      const cs = b.changesSummary as any;
      return sum + (cs?.high || 0);
    }, 0);

    const riskScores = deviceBackups.map(b => b.riskScore).filter((r): r is number => r !== null);
    const avgRiskScore = riskScores.length > 0
      ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      : 0;

    return {
      deviceId: device.id,
      deviceName: device.name,
      deviceIp: device.ip,
      deviceType: device.type,
      vendor: device.vendor,
      backupCount: deviceBackups.length,
      lastBackup: lastBackup?.timestamp ?? null,
      lastBackupStatus: lastBackup?.status ?? 'NONE',
      daysSinceLastBackup,
      isCompliant: daysSinceLastBackup <= 7,
      avgBackupSize: successfulDeviceBackups.length > 0
        ? successfulDeviceBackups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0) / successfulDeviceBackups.length
        : 0,
      totalStorageUsed: deviceBackups.reduce((sum, b) => sum + (b.compressedBytes || 0), 0),
      criticalChanges,
      highChanges,
      riskScore: Math.round(avgRiskScore),
    };
  });

  // Critical changes detail
  const criticalChanges: CriticalChangeDetail[] = [];
  if (includeDetails) {
    for (const backup of backups) {
      const cc = backup.criticalChanges as any[];
      if (cc && cc.length > 0) {
        const device = deviceMap.get(backup.deviceId);
        for (const change of cc) {
          criticalChanges.push({
            backupId: backup.id,
            deviceName: device?.name ?? 'Unknown',
            deviceIp: device?.ip ?? 'Unknown',
            timestamp: backup.timestamp,
            severity: change.severity,
            section: change.section,
            preview: change.preview,
            patterns: change.patterns,
          });
        }
      }
    }
  }

  // Failed backups detail
  const failedBackupDetails: FailedBackupDetail[] = failedBackups.map(b => {
    const device = deviceMap.get(b.deviceId);
    return {
      backupId: b.id,
      deviceName: device?.name ?? 'Unknown',
      deviceIp: device?.ip ?? 'Unknown',
      timestamp: b.timestamp,
      errorMessage: b.errorMessage,
    };
  });

  // Storage breakdown
  const storageLocations = ['database', 'filesystem'] as const;
  const storageBreakdown: StorageBreakdown[] = storageLocations.map(loc => {
    const locBackups = backups.filter(b => b.storageLocation === loc);
    const totalSize = locBackups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0);
    const compressedSize = locBackups.reduce((sum, b) => sum + (b.compressedBytes || 0), 0);
    return {
      storageLocation: loc,
      backupCount: locBackups.length,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      compressedSizeMB: Math.round(compressedSize / 1024 / 1024 * 100) / 100,
      compressionRatio: totalSize > 0 ? Math.round((1 - compressedSize / totalSize) * 10000) / 100 : 0,
    };
  });

  const summary = {
    period: `${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`,
    totalDevices,
    devicesWithBackups: devicesWithBackupsCount,
    totalBackups: backups.length,
    successfulBackups: successfulBackups.length,
    failedBackups: failedBackups.length,
    backupCoverage: totalDevices > 0 ? Math.round((devicesWithBackupsCount / totalDevices) * 10000) / 100 : 0,
    successRate: backups.length > 0 ? Math.round((successfulBackups.length / backups.length) * 10000) / 100 : 0,
    avgBackupSize: successfulBackups.length > 0
      ? Math.round(successfulBackups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0) / successfulBackups.length)
      : 0,
    totalStorageUsed: Math.round(backups.reduce((sum, b) => sum + (b.compressedBytes || 0), 0) / 1024 / 1024 * 100) / 100,
    criticalChangesCount: criticalChanges.length,
    highChangesCount: backups.reduce((sum, b) => {
      const cs = b.changesSummary as any;
      return sum + (cs?.high || 0);
    }, 0),
    devicesNeverBackedUp: totalDevices - devicesWithBackupsCount,
  };

  return {
    summary,
    deviceDetails,
    criticalChanges,
    failedBackups: failedBackupDetails,
    storageBreakdown,
  };
}

/**
 * Generate PDF report
 */
export async function generatePDFReport(data: ComplianceReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text('Backup Compliance Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(data.summary.period, { align: 'center' });
    doc.moveDown(2);

    // Summary Table
    doc.fontSize(14).font('Helvetica-Bold').text('Executive Summary');
    doc.moveDown();

    const summaryRows = [
      ['Total Devices', data.summary.totalDevices.toString()],
      ['Devices with Backups', data.summary.devicesWithBackups.toString()],
      ['Backup Coverage', `${data.summary.backupCoverage}%`],
      ['Total Backups', data.summary.totalBackups.toString()],
      ['Successful Backups', data.summary.successfulBackups.toString()],
      ['Failed Backups', data.summary.failedBackups.toString()],
      ['Success Rate', `${data.summary.successRate}%`],
      ['Avg Backup Size', formatBytes(data.summary.avgBackupSize)],
      ['Total Storage Used', `${data.summary.totalStorageUsed} MB`],
      ['Critical Changes', data.summary.criticalChangesCount.toString()],
      ['High Changes', data.summary.highChangesCount.toString()],
      ['Devices Never Backed Up', data.summary.devicesNeverBackedUp.toString()],
    ];

    drawTable(doc, ['Metric', 'Value'], summaryRows);
    doc.moveDown(2);

    // Storage Breakdown
    doc.fontSize(14).font('Helvetica-Bold').text('Storage Breakdown');
    doc.moveDown();

    const storageRows = data.storageBreakdown.map(s => [
      s.storageLocation === 'database' ? 'Database (Hot)' : 'Filesystem (Archive)',
      s.backupCount.toString(),
      `${s.totalSizeMB} MB`,
      `${s.compressedSizeMB} MB`,
      `${s.compressionRatio}%`,
    ]);
    drawTable(doc, ['Storage Tier', 'Backups', 'Original Size', 'Compressed Size', 'Compression'], storageRows);
    doc.moveDown(2);

    // Device Compliance
    doc.fontSize(14).font('Helvetica-Bold').text('Device Compliance');
    doc.moveDown();

    const deviceRows = data.deviceDetails.map(d => [
      d.deviceName,
      d.deviceIp,
      d.deviceType,
      d.backupCount.toString(),
      d.lastBackup ? new Date(d.lastBackup).toLocaleDateString('id-ID') : 'Never',
      `${d.daysSinceLastBackup} days`,
      d.isCompliant ? '✓ Compliant' : '✗ Non-Compliant',
      d.criticalChanges.toString(),
      d.highChanges.toString(),
      d.riskScore.toString(),
    ]);
    drawTable(doc, [
      'Device', 'IP', 'Type', 'Backups', 'Last Backup',
      'Days Ago', 'Status', 'Critical', 'High', 'Risk'
    ], deviceRows);
    doc.moveDown(2);

    // Critical Changes
    if (data.criticalChanges.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Critical & High Severity Changes');
      doc.moveDown();

      const changeRows = data.criticalChanges.slice(0, 20).map(c => [
        c.deviceName,
        c.deviceIp,
        new Date(c.timestamp).toLocaleDateString('id-ID'),
        c.severity,
        c.section,
        c.preview.substring(0, 50),
      ]);
      drawTable(doc, ['Device', 'IP', 'Date', 'Severity', 'Section', 'Preview'], changeRows);
      if (data.criticalChanges.length > 20) {
        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Oblique').text(`... and ${data.criticalChanges.length - 20} more critical changes`);
      }
      doc.moveDown(2);
    }

    // Failed Backups
    if (data.failedBackups.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Failed Backups');
      doc.moveDown();

      const failRows = data.failedBackups.map(f => [
        f.deviceName,
        f.deviceIp,
        new Date(f.timestamp).toLocaleDateString('id-ID'),
        f.errorMessage?.substring(0, 60) ?? 'Unknown error',
      ]);
      drawTable(doc, ['Device', 'IP', 'Date', 'Error'], failRows);
    }

    doc.end();
  });
}

/**
 * Generate Excel report
 */
export async function generateExcelReport(data: ComplianceReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HK-NOVA';
  workbook.created = new Date();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 30 },
  ];

  const summaryRows = [
    { metric: 'Report Period', value: data.summary.period },
    { metric: 'Generated At', value: new Date().toLocaleString('id-ID') },
    { metric: 'Total Devices', value: data.summary.totalDevices },
    { metric: 'Devices with Backups', value: data.summary.devicesWithBackups },
    { metric: 'Backup Coverage', value: `${data.summary.backupCoverage}%` },
    { metric: 'Total Backups', value: data.summary.totalBackups },
    { metric: 'Successful Backups', value: data.summary.successfulBackups },
    { metric: 'Failed Backups', value: data.summary.failedBackups },
    { metric: 'Success Rate', value: `${data.summary.successRate}%` },
    { metric: 'Avg Backup Size', value: formatBytes(data.summary.avgBackupSize) },
    { metric: 'Total Storage Used', value: `${data.summary.totalStorageUsed} MB` },
    { metric: 'Critical Changes', value: data.summary.criticalChangesCount },
    { metric: 'High Changes', value: data.summary.highChangesCount },
    { metric: 'Devices Never Backed Up', value: data.summary.devicesNeverBackedUp },
  ];
  summarySheet.addRows(summaryRows);

  // Style header
  summarySheet.getRow(1).font = { bold: true, size: 14 };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Storage Sheet
  const storageSheet = workbook.addWorksheet('Storage Breakdown');
  storageSheet.columns = [
    { header: 'Storage Tier', key: 'tier', width: 20 },
    { header: 'Backup Count', key: 'count', width: 15 },
    { header: 'Original Size (MB)', key: 'orig', width: 20 },
    { header: 'Compressed Size (MB)', key: 'comp', width: 20 },
    { header: 'Compression Ratio', key: 'ratio', width: 18 },
  ];
  data.storageBreakdown.forEach(s => {
    storageSheet.addRow({
      tier: s.storageLocation === 'database' ? 'Database (Hot)' : 'Filesystem (Archive)',
      count: s.backupCount,
      orig: s.totalSizeMB,
      comp: s.compressedSizeMB,
      ratio: `${s.compressionRatio}%`,
    });
  });

  // Device Compliance Sheet
  const deviceSheet = workbook.addWorksheet('Device Compliance');
  deviceSheet.columns = [
    { header: 'Device Name', key: 'name', width: 25 },
    { header: 'IP Address', key: 'ip', width: 18 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Backups', key: 'backups', width: 10 },
    { header: 'Last Backup', key: 'lastBackup', width: 20 },
    { header: 'Days Ago', key: 'daysAgo', width: 12 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Critical Changes', key: 'critical', width: 15 },
    { header: 'High Changes', key: 'high', width: 12 },
    { header: 'Risk Score', key: 'risk', width: 12 },
  ];
  data.deviceDetails.forEach(d => {
    const row = deviceSheet.addRow({
      name: d.deviceName,
      ip: d.deviceIp,
      type: d.deviceType,
      backups: d.backupCount,
      lastBackup: d.lastBackup ? new Date(d.lastBackup).toLocaleDateString('id-ID') : 'Never',
      daysAgo: d.daysSinceLastBackup,
      status: d.isCompliant ? 'Compliant' : 'Non-Compliant',
      critical: d.criticalChanges,
      high: d.highChanges,
      risk: d.riskScore,
    });
    if (!d.isCompliant) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
      row.font = { color: { argb: 'FFDC2626' } };
    }
  });

  // Critical Changes Sheet
  if (data.criticalChanges.length > 0) {
    const changesSheet = workbook.addWorksheet('Critical Changes');
    changesSheet.columns = [
      { header: 'Device', key: 'device', width: 25 },
      { header: 'IP', key: 'ip', width: 18 },
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Section', key: 'section', width: 30 },
      { header: 'Preview', key: 'preview', width: 50 },
      { header: 'Patterns', key: 'patterns', width: 40 },
    ];
    data.criticalChanges.forEach(c => {
      changesSheet.addRow({
        device: c.deviceName,
        ip: c.deviceIp,
        date: new Date(c.timestamp).toLocaleDateString('id-ID'),
        severity: c.severity,
        section: c.section,
        preview: c.preview,
        patterns: c.patterns.join(', '),
      });
    });
  }

  // Failed Backups Sheet
  if (data.failedBackups.length > 0) {
    const failSheet = workbook.addWorksheet('Failed Backups');
    failSheet.columns = [
      { header: 'Device', key: 'device', width: 25 },
      { header: 'IP', key: 'ip', width: 18 },
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Error', key: 'error', width: 60 },
    ];
    data.failedBackups.forEach(f => {
      failSheet.addRow({
        device: f.deviceName,
        ip: f.deviceIp,
        date: new Date(f.timestamp).toLocaleDateString('id-ID'),
        error: f.errorMessage ?? 'Unknown error',
      });
    });
  }

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][]) {
  const colWidths = headers.map((_, i) => {
    const maxContent = Math.max(headers[i].length, ...rows.map(r => (r[i] || '').length));
    return Math.min(Math.max(maxContent * 6, 50), 120);
  });

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = (doc.page.width - doc.page.margins.left - doc.page.margins.right - totalWidth) / 2 + doc.page.margins.left;
  let y = doc.y;

  // Header
  doc.font('Helvetica-Bold').fontSize(8);
  doc.fillColor('#1e293b').rect(startX, y, totalWidth, 20).fill();
  doc.fillColor('white');
  let x = startX;
  headers.forEach((header, i) => {
    doc.text(header, x + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
    x += colWidths[i];
  });
  y += 20;

  // Rows
  doc.font('Helvetica').fontSize(7);
  rows.forEach((row, rowIndex) => {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    if (rowIndex % 2 === 0) {
      doc.fillColor('#f8fafc').rect(startX, y, totalWidth, 18).fill();
    }
    doc.fillColor('#1e293b');
    x = startX;
    row.forEach((cell, i) => {
      doc.text(cell, x + 4, y + 4, { width: colWidths[i] - 8, ellipsis: true });
      x += colWidths[i];
    });
    y += 18;
  });

  doc.y = y + 10;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}