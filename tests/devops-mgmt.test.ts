import { describe, it, expect } from 'vitest';
import {
  OLT_TEMPLATES,
  resolveTemplate,
  renderActionCommands,
  validateActionFields,
  getTemplateMetadata,
} from '@/lib/olt-templates';
import { diffTexts, diffStats, type DiffLine } from '@/lib/diff';

describe('OLT template renderer', () => {
  it('resolveTemplate memilih Huawei/ZTE/Generic berdasarkan vendor', () => {
    expect(resolveTemplate('Huawei Technologies')).toMatchObject({ name: 'huawei' });
    expect(resolveTemplate('ZTE Corporation')).toMatchObject({ name: 'zte' });
    expect(resolveTemplate('Some Vendor')).toMatchObject({ name: 'generic' });
    expect(resolveTemplate(null)).toMatchObject({ name: 'generic' });
  });

  it('renderActionCommands mensubstitusi placeholder di huawei', () => {
    const { commands } = renderActionCommands(OLT_TEMPLATES.huawei, 'suspend_service', {
      ponPort: '0/1',
      ontSlot: '1',
    });
    expect(commands).toContain('interface gpon 0/0/1');
    expect(commands).toContain('ont modify 1 state block');
  });

  it('mengisi semua field wajib create_service generic', () => {
    const { commands, description } = renderActionCommands(OLT_TEMPLATES.generic, 'create_service', {
      ponPort: '0/2',
      ontSlot: '3',
      ontSerial: 'HWTC12345678',
      vlan: 100,
    });
    expect(commands[2]).toBe('add ont 3 serial HWTC12345678');
    expect(commands[3]).toBe('vlan 100');
    expect(description).toContain('Generic');
  });

  it('menolak saat field wajib kosong dan melaporkan namanya', () => {
    const missing = validateActionFields(OLT_TEMPLATES.huawei, 'create_service', {
      ponPort: '0/1',
    });
    expect(missing).toContain('ontSlot');
    expect(missing).not.toContain('ponPort');

    expect(() =>
      renderActionCommands(OLT_TEMPLATES.huawei, 'create_service', { ponPort: '0/1' })
    ).toThrow('Field wajib');
  });

  it('menolak action yang tidak dikenal di template', () => {
    expect(() =>
      renderActionCommands(OLT_TEMPLATES.zte, 'create_service', {
        ponPort: '1',
        ontSlot: '2',
        ontSerial: 'SN',
        vlan: 10,
        ontType: 'ZTE-ONU',
        tcontProfile: '1',
      })
    ).not.toThrow(); // zte memang punya create_service

    expect(() => renderActionCommands(OLT_TEMPLATES.zte, 'no_such_action', {})).toThrow(
      'tidak tersedia'
    );
  });

  it('getTemplateMetadata menyediakan field wajib per aksi', () => {
    const meta = getTemplateMetadata(OLT_TEMPLATES.generic);
    const create = meta.find((m) => m.action === 'create_service');
    expect(create).toBeDefined();
    expect(create!.requiredFields).toEqual(expect.arrayContaining(['ponPort', 'ontSlot', 'ontSerial', 'vlan']));
    expect(meta).toHaveLength(5); // 5 aksi
  });
});

describe('Diff engine', () => {
  it('teks identik → semua stay "same"', () => {
    const lines = diffTexts('a\nb\nc\n', 'a\nb\nc\n');
    expect(lines.every((l) => l.kind === 'same')).toBe(true);
    expect(lines.map((l) => l.text)).toContain('a');
    expect(lines.map((l) => l.text)).toContain('c');
  });

  it('mendeteksi baris yang ditambah', () => {
    const lines = diffTexts('a\nb\n', 'a\nb\nX\n');
    expect(lines).toContainEqual({ kind: 'add', text: 'X' });
    const stats = diffStats(lines);
    expect(stats.add).toBe(1);
    expect(stats.del).toBe(0);
  });

  it('mendeteksi baris yang dihapus', () => {
    const lines = diffTexts('a\nb\nc\n', 'a\nc\n');
    expect(lines).toContainEqual({ kind: 'del', text: 'b' });
  });

  it('fallback untuk input besar tetap menghasilkan urutan valid', () => {
    const prev = Array.from({ length: 3000 }, (_, i) => `line-${i}`);
    const cur = [`new-1`, ...prev.slice(0, 1500), `new-2`, ...prev.slice(1600)];
    const lines = diffTexts(prev.join('\n'), cur.join('\n'));
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    const flat: DiffLine[] = lines;
    expect(flat.some((l) => l.kind === 'add' || l.kind === 'del')).toBe(true);
  });
});