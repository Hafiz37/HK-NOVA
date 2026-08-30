import { validateExpression, evaluateCondition as evaluateConditionSafe } from '../safe-evaluator';

export interface ConditionValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Validate condition for UI input
 */
export function validateConditionForUI(condition: string): ConditionValidationResult {
  if (!condition || condition.trim() === '') {
    return {
      valid: false,
      error: 'Condition cannot be empty',
      suggestion: 'Enter a condition like: x > 5',
    };
  }

  const result = validateExpression(condition);
  
  if (!result.valid) {
    return {
      valid: false,
      error: result.error,
      suggestion: getSuggestion(condition, result.error),
    };
  }

  return { valid: true };
}

/**
 * Get helpful suggestion based on error
 */
function getSuggestion(condition: string, error?: string): string | undefined {
  if (!error) return undefined;

  if (error.includes('Dangerous pattern')) {
    return 'Use only mathematical and logical operators. Functions like process, require, eval are not allowed for security reasons.';
  }

  if (error.includes('too long')) {
    return 'Simplify your condition or split into multiple steps. Maximum length is 1000 characters.';
  }

  if (error.includes('too complex')) {
    return 'Reduce nesting depth (max 10 levels). Use intermediate variables or split into multiple conditions.';
  }

  if (error.includes('parse error') || error.includes('Unexpected token')) {
    return 'Check your syntax. Common issues: missing operators, unmatched parentheses, or incorrect quotes.';
  }

  if (error.includes('undefined variable')) {
    const match = error.match(/undefined variable: (\w+)/);
    if (match) {
      return `Variable "${match[1]}" is not defined. Make sure all variables are available in the workflow context.`;
    }
    return 'One or more variables are not defined. Check that all variables exist in your workflow.';
  }

  return 'Check the syntax guide for valid operators and examples.';
}

/**
 * Format condition for display (make it more readable)
 */
export function formatCondition(condition: string): string {
  return condition
    .replace(/\s+and\s+/g, ' AND ')
    .replace(/\s+or\s+/g, ' OR ')
    .replace(/\s+not\s+/g, ' NOT ')
    .replace(/&&/g, ' AND ')
    .replace(/\|\|/g, ' OR ')
    .replace(/!(?!=)/g, 'NOT ')
    .replace(/==/g, ' equals ')
    .replace(/!=/g, ' not equals ')
    .replace(/>=/g, ' >= ')
    .replace(/<=/g, ' <= ')
    .replace(/>/g, ' > ')
    .replace(/</g, ' < ');
}

/**
 * Highlight syntax in condition (returns parts for styling)
 */
export function highlightCondition(condition: string): Array<{ text: string; type: string }> {
  const parts: Array<{ text: string; type: string }> = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < condition.length; i++) {
    const char = condition[i];
    
    // Handle strings
    if ((char === '"' || char === "'") && !inString) {
      if (current) {
        parts.push(...tokenize(current));
        current = '';
      }
      inString = true;
      stringChar = char;
      current = char;
      continue;
    }
    
    if (inString && char === stringChar) {
      current += char;
      parts.push({ text: current, type: 'string' });
      current = '';
      inString = false;
      continue;
    }

    current += char;
  }

  if (current) {
    if (inString) {
      parts.push({ text: current, type: 'string' });
    } else {
      parts.push(...tokenize(current));
    }
  }

  return parts;
}

function tokenize(text: string): Array<{ text: string; type: string }> {
  const parts: Array<{ text: string; type: string }> = [];
  const tokens = text.split(/(\s+|&&|\|\||[()><=!+\-*/%^])/);
  
  for (const token of tokens) {
    if (!token) continue;
    
    if (/^\s+$/.test(token)) {
      parts.push({ text: token, type: 'whitespace' });
    } else if (['&&', '||', 'and', 'or', 'not'].includes(token.toLowerCase())) {
      parts.push({ text: token, type: 'operator-boolean' });
    } else if (['>', '<', '>=', '<=', '==', '!='].includes(token)) {
      parts.push({ text: token, type: 'operator-comparison' });
    } else if (['+', '-', '*', '/', '%', '^'].includes(token)) {
      parts.push({ text: token, type: 'operator-arithmetic' });
    } else if (['(', ')'].includes(token)) {
      parts.push({ text: token, type: 'parenthesis' });
    } else if (/^\d+(\.\d+)?$/.test(token)) {
      parts.push({ text: token, type: 'number' });
    } else if (/^[a-zA-Z_]\w*$/.test(token)) {
      parts.push({ text: token, type: 'variable' });
    } else {
      parts.push({ text: token, type: 'unknown' });
    }
  }
  
  return parts;
}

/**
 * Syntax examples for UI
 */
export const CONDITION_EXAMPLES = [
  {
    category: 'Basic Comparisons',
    examples: [
      {
        label: 'Simple Comparison',
        code: 'severity == "HIGH"',
        description: 'Check if severity equals HIGH',
        variables: ['severity'],
      },
      {
        label: 'Numeric Threshold',
        code: 'cpuUtil > 80',
        description: 'Check if CPU utilization exceeds 80%',
        variables: ['cpuUtil'],
      },
      {
        label: 'Range Check',
        code: 'value >= 10 && value <= 100',
        description: 'Check if value is between 10 and 100',
        variables: ['value'],
      },
    ],
  },
  {
    category: 'Boolean Logic',
    examples: [
      {
        label: 'AND Condition',
        code: 'severity == "HIGH" && deviceType == "OLT"',
        description: 'Both conditions must be true',
        variables: ['severity', 'deviceType'],
      },
      {
        label: 'OR Condition',
        code: 'status == "DOWN" || latency > 1000',
        description: 'Either condition can be true',
        variables: ['status', 'latency'],
      },
      {
        label: 'NOT Condition',
        code: '!(status == "MAINTENANCE")',
        description: 'Negate a condition',
        variables: ['status'],
      },
    ],
  },
  {
    category: 'Arithmetic',
    examples: [
      {
        label: 'Calculate Average',
        code: '(cpuUtil + memUtil) / 2 > 75',
        description: 'Average of CPU and memory exceeds 75%',
        variables: ['cpuUtil', 'memUtil'],
      },
      {
        label: 'Percentage Increase',
        code: '(currentValue - previousValue) / previousValue > 0.1',
        description: 'Value increased by more than 10%',
        variables: ['currentValue', 'previousValue'],
      },
    ],
  },
  {
    category: 'Complex Conditions',
    examples: [
      {
        label: 'Multiple Conditions',
        code: 'severity == "CRITICAL" && deviceType == "OLT" && region == "APAC"',
        description: 'All three conditions must be true',
        variables: ['severity', 'deviceType', 'region'],
      },
      {
        label: 'Nested Logic',
        code: '(severity == "HIGH" || severity == "CRITICAL") && status != "MAINTENANCE"',
        description: 'High or critical severity, but not in maintenance',
        variables: ['severity', 'status'],
      },
    ],
  },
];

/**
 * Allowed operators documentation for UI
 */
export const ALLOWED_OPERATORS = {
  comparison: [
    { op: '>', desc: 'Greater than', example: 'x > 5' },
    { op: '<', desc: 'Less than', example: 'x < 10' },
    { op: '>=', desc: 'Greater than or equal', example: 'x >= 5' },
    { op: '<=', desc: 'Less than or equal', example: 'x <= 10' },
    { op: '==', desc: 'Equals', example: 'status == "ACTIVE"' },
    { op: '!=', desc: 'Not equals', example: 'status != "DOWN"' },
  ],
  logical: [
    { op: '&&', desc: 'AND (both must be true)', example: 'x > 5 && y < 10' },
    { op: '||', desc: 'OR (at least one true)', example: 'x > 100 || y > 100' },
    { op: '!', desc: 'NOT (negation)', example: '!(x > 5)' },
  ],
  arithmetic: [
    { op: '+', desc: 'Addition', example: 'a + b' },
    { op: '-', desc: 'Subtraction', example: 'a - b' },
    { op: '*', desc: 'Multiplication', example: 'a * b' },
    { op: '/', desc: 'Division', example: 'a / b' },
    { op: '%', desc: 'Modulo', example: 'x % 2 == 0' },
    { op: '^', desc: 'Power', example: 'x ^ 2' },
  ],
};

/**
 * Common mistakes and how to fix them
 */
export const COMMON_MISTAKES = [
  {
    mistake: 'Using = instead of ==',
    wrong: 'status = "ACTIVE"',
    correct: 'status == "ACTIVE"',
    explanation: 'Use == for comparison, not =',
  },
  {
    mistake: 'Missing quotes for strings',
    wrong: 'status == ACTIVE',
    correct: 'status == "ACTIVE"',
    explanation: 'String values must be in quotes',
  },
  {
    mistake: 'Unmatched parentheses',
    wrong: '(x > 5 && y < 10',
    correct: '(x > 5 && y < 10)',
    explanation: 'Every opening ( must have a closing )',
  },
  {
    mistake: 'Using JavaScript methods',
    wrong: 'status.toLowerCase() == "active"',
    correct: 'status == "active"',
    explanation: 'String methods are not supported for security',
  },
];

/**
 * Extract variables used in a condition
 */
export function extractVariables(condition: string): string[] {
  const variables = new Set<string>();
  const tokens = condition.split(/[^a-zA-Z_]\w*/);
  
  // Simple regex to find variable names (alphanumeric + underscore)
  const regex = /\b[a-zA-Z_]\w*\b/g;
  let match;
  
  while ((match = regex.exec(condition)) !== null) {
    const word = match[0];
    // Exclude keywords
    if (!['and', 'or', 'not', 'true', 'false'].includes(word.toLowerCase())) {
      variables.add(word);
    }
  }
  
  return Array.from(variables).sort();
}

/**
 * Test a condition with sample values
 */
export function testCondition(
  condition: string,
  variables: Record<string, any>
): { success: boolean; result?: boolean; error?: string } {
  const validation = validateConditionForUI(condition);
  
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    const result = evaluateConditionSafe(condition, variables);
    
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
