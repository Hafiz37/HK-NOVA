import { renderActionCommands, OLT_TEMPLATES, type TemplateName, type ProvisioningFields, type OLTTemplate } from './olt-templates';

export interface TestCase {
  id: string;
  name: string;
  templateName: TemplateName;
  action: string;
  fields: ProvisioningFields;
  expectedCommands: string[];
}

export interface TestResult {
  testCaseId: string;
  testCaseName: string;
  passed: boolean;
  actualCommands?: string[];
  expectedCommands?: string[];
  error?: string;
  diff?: Array<{ line: number; expected: string; actual: string }>;
}

export interface TestSuiteResult {
  passed: boolean;
  totalTests: number;
  passCount: number;
  failCount: number;
  results: TestResult[];
}

export const DEFAULT_TEST_SUITE: TestCase[] = [
  {
    id: 'hw-create-1',
    name: 'Huawei Create Service - Normal Flow',
    templateName: 'huawei',
    action: 'create_service',
    fields: {
      ponPort: '0/1',
      ontSlot: '1',
      ontSerial: 'HWTC12345678',
      vlan: 100,
      serviceProfile: '10',
      lineProfile: '20',
      servicePort: '1',
    },
    expectedCommands: [
      'interface gpon 0/0/1',
      'ont add 1 sn-auth HWTC12345678 omci ont-lineprofile-id 20 ont-srvprofile-id 10',
      'ont port native-vlan 1 eth 1 vlan-id 100',
      'service-port 1 vlan 100 gpon 0/0/1 ont 1 gemport 1 multi-service user-vlan 100',
      'quit',
    ],
  },
  {
    id: 'zte-create-1',
    name: 'ZTE Create Service - Normal Flow',
    templateName: 'zte',
    action: 'create_service',
    fields: {
      ponPort: '1/1/1',
      ontSlot: '1',
      ontSerial: 'ZTEG87654321',
      vlan: 200,
      tcontProfile: '5',
      ontType: 'F660',
    },
    expectedCommands: [
      'configure terminal',
      'interface gpon-olt_1/1/1',
      'onu 1 type F660 sn ZTEG87654321',
      'exit',
      'interface gpon-onu_1/1/1:1',
      'tcont 1 profile 5',
      'gemport 1 tcont 1',
      'switchport mode hybrid vlan 200 tag',
      'exit',
    ],
  },
  {
    id: 'gen-suspend-1',
    name: 'Generic Suspend Service - Normal Flow',
    templateName: 'generic',
    action: 'suspend_service',
    fields: {
      ponPort: '1',
      ontSlot: '10',
    },
    expectedCommands: [
      'config',
      'interface pon 1',
      'ont 10 disable',
      'commit',
      'exit',
    ],
  },
];

export function runTestCase(testCase: TestCase, customTemplate?: OLTTemplate): TestResult {
  const template = customTemplate ?? OLT_TEMPLATES[testCase.templateName];

  try {
    const rendered = renderActionCommands(template, testCase.action, testCase.fields);
    const actualCommands = rendered.commands;

    const diff: Array<{ line: number; expected: string; actual: string }> = [];
    let isMatch = actualCommands.length === testCase.expectedCommands.length;

    const maxLength = Math.max(actualCommands.length, testCase.expectedCommands.length);
    for (let i = 0; i < maxLength; i++) {
      const exp = testCase.expectedCommands[i] ?? '[MISSING]';
      const act = actualCommands[i] ?? '[MISSING]';
      if (exp !== act) {
        isMatch = false;
        diff.push({ line: i + 1, expected: exp, actual: act });
      }
    }

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      passed: isMatch,
      actualCommands,
      expectedCommands: testCase.expectedCommands,
      diff: diff.length > 0 ? diff : undefined,
    };
  } catch (err) {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      passed: false,
      expectedCommands: testCase.expectedCommands,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function runTestSuite(testCases: TestCase[] = DEFAULT_TEST_SUITE): TestSuiteResult {
  const results = testCases.map((tc) => runTestCase(tc));
  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.length - passCount;

  return {
    passed: failCount === 0,
    totalTests: results.length,
    passCount,
    failCount,
    results,
  };
}