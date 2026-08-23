export function parseBatchProvisioningInput(input: string, format: 'csv' | 'json'): Array<Record<string, unknown>> {
  if (format === 'json') {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON input must be an array');
    }
    return parsed;
  }

  // CSV parsing
  const lines = input.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least header and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    if (values.length !== headers.length) {
      throw new Error(`Row ${i + 1}: column count mismatch`);
    }

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      let value: unknown = values[index];
      // Try to parse numbers
      if (!isNaN(Number(value)) && value !== '') {
        value = Number(value);
      }
      // Convert 'true'/'false' to boolean
      if (value === 'true') value = true;
      if (value === 'false') value = false;
      row[header] = value;
    });
    rows.push(row);
  }

  return rows;
}

export const BATCH_CSV_TEMPLATE = `ponPort,ontSlot,ontSerial,vlan,serviceProfile,lineProfile,tcontProfile,ontType,servicePort
0/1,1,HWTC12345678,100,10,20,30,HG8245H,1
0/1,2,HWTC87654321,101,10,20,30,HG8245H,1`;

export const BATCH_JSON_TEMPLATE = `[
  {
    "ponPort": "0/1",
    "ontSlot": "1",
    "ontSerial": "HWTC12345678",
    "vlan": 100,
    "serviceProfile": "10",
    "lineProfile": "20",
    "tcontProfile": "30",
    "ontType": "HG8245H",
    "servicePort": "1"
  },
  {
    "ponPort": "0/1",
    "ontSlot": "2",
    "ontSerial": "HWTC87654321",
    "vlan": 101,
    "serviceProfile": "10",
    "lineProfile": "20",
    "tcontProfile": "30",
    "ontType": "HG8245H",
    "servicePort": "1"
  }
]`;