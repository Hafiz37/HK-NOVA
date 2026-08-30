export const WORKFLOW_SYNTAX_GUIDE = {
  title: 'Workflow Condition Syntax Guide',
  description: 'Safe expression language for workflow conditions',
  
  overview: {
    summary: 'Use mathematical and logical operators to create conditions. All expressions run in a secure sandbox.',
    security: [
      '✅ Mathematical operations',
      '✅ Logical comparisons',
      '✅ Variable access',
      '✅ String comparison',
      '❌ Code execution (eval, Function, require)',
      '❌ System access (process, fs, os)',
      '❌ Prototype manipulation',
    ],
  },

  operators: {
    comparison: [
      { symbol: '>', name: 'Greater than', example: 'x > 5', result: 'true if x is greater than 5' },
      { symbol: '<', name: 'Less than', example: 'x < 10', result: 'true if x is less than 10' },
      { symbol: '>=', name: 'Greater or equal', example: 'x >= 5', result: 'true if x is 5 or more' },
      { symbol: '<=', name: 'Less or equal', example: 'x <= 10', result: 'true if x is 10 or less' },
      { symbol: '==', name: 'Equals', example: 'status == "ACTIVE"', result: 'true if status is ACTIVE' },
      { symbol: '!=', name: 'Not equals', example: 'status != "DOWN"', result: 'true if status is not DOWN' },
    ],
    logical: [
      { symbol: '&&', name: 'AND', example: 'x > 5 && y < 10', result: 'true if both conditions are true' },
      { symbol: '||', name: 'OR', example: 'x > 100 || y > 100', result: 'true if either condition is true' },
      { symbol: '!', name: 'NOT', example: '!(x > 5)', result: 'true if x is NOT greater than 5' },
    ],
    arithmetic: [
      { symbol: '+', name: 'Add', example: 'a + b', result: 'sum of a and b' },
      { symbol: '-', name: 'Subtract', example: 'a - b', result: 'difference of a and b' },
      { symbol: '*', name: 'Multiply', example: 'a * b', result: 'product of a and b' },
      { symbol: '/', name: 'Divide', example: 'a / b', result: 'quotient of a divided by b' },
      { symbol: '%', name: 'Modulo', example: 'x % 2', result: 'remainder of x divided by 2' },
      { symbol: '^', name: 'Power', example: 'x ^ 2', result: 'x to the power of 2' },
    ],
  },

  examples: {
    basic: [
      {
        title: 'Check Severity',
        code: 'severity == "HIGH"',
        explanation: 'Returns true when severity equals HIGH',
        useCase: 'Alert routing based on severity',
      },
      {
        title: 'CPU Threshold',
        code: 'cpuUtil > 80',
        explanation: 'Returns true when CPU utilization exceeds 80%',
        useCase: 'High CPU alert trigger',
      },
      {
        title: 'Device Type Check',
        code: 'deviceType == "OLT"',
        explanation: 'Returns true for OLT devices only',
        useCase: 'Device-specific workflows',
      },
    ],
    intermediate: [
      {
        title: 'Multiple Conditions (AND)',
        code: 'severity == "HIGH" && deviceType == "OLT"',
        explanation: 'Both conditions must be true',
        useCase: 'High severity alerts for OLT devices',
      },
      {
        title: 'Multiple Conditions (OR)',
        code: 'status == "DOWN" || latency > 1000',
        explanation: 'Either condition can trigger',
        useCase: 'Alert on device down OR high latency',
      },
      {
        title: 'Range Check',
        code: 'value >= 10 && value <= 100',
        explanation: 'Value must be between 10 and 100',
        useCase: 'Validate metric is within acceptable range',
      },
    ],
    advanced: [
      {
        title: 'Calculate Average',
        code: '(cpuUtil + memUtil) / 2 > 75',
        explanation: 'Average of CPU and memory exceeds 75%',
        useCase: 'Alert on high overall system utilization',
      },
      {
        title: 'Complex Logic',
        code: '(severity == "HIGH" || severity == "CRITICAL") && status != "MAINTENANCE"',
        explanation: 'High/Critical severity, but not in maintenance',
        useCase: 'Skip alerts during maintenance windows',
      },
      {
        title: 'Percentage Change',
        code: '(currentValue - previousValue) / previousValue > 0.1',
        explanation: 'Value increased by more than 10%',
        useCase: 'Alert on sudden metric spikes',
      },
    ],
  },

  bestPractices: [
    {
      title: 'Keep It Simple',
      do: 'x > 5 && y < 10',
      dont: '((((x > 5) && (y < 10))))',
      reason: 'Unnecessary parentheses reduce readability',
    },
    {
      title: 'Use Descriptive Variables',
      do: 'cpuUtilization > 80',
      dont: 'x > 80',
      reason: 'Clear variable names make conditions self-documenting',
    },
    {
      title: 'Quote String Values',
      do: 'status == "ACTIVE"',
      dont: 'status == ACTIVE',
      reason: 'Strings must be in quotes',
    },
    {
      title: 'Use Parentheses for Clarity',
      do: '(a + b) * c',
      dont: 'a + b * c',
      reason: 'Makes order of operations explicit',
    },
  ],

  commonMistakes: [
    {
      mistake: 'Using = instead of ==',
      wrong: 'status = "ACTIVE"',
      correct: 'status == "ACTIVE"',
      explanation: 'Use == for comparison, = is for assignment (not supported)',
    },
    {
      mistake: 'Missing quotes on strings',
      wrong: 'status == ACTIVE',
      correct: 'status == "ACTIVE"',
      explanation: 'String values must be enclosed in quotes',
    },
    {
      mistake: 'Unmatched parentheses',
      wrong: '(x > 5 && y < 10',
      correct: '(x > 5 && y < 10)',
      explanation: 'Every ( must have a matching )',
    },
    {
      mistake: 'Using JavaScript methods',
      wrong: 'status.toLowerCase() == "active"',
      correct: 'status == "active"',
      explanation: 'Object methods not supported for security',
    },
    {
      mistake: 'Trying to access system functions',
      wrong: 'process.env.NODE_ENV == "production"',
      correct: 'environment == "production"',
      explanation: 'System access blocked for security',
    },
  ],

  limitations: [
    {
      feature: 'Array/Object Methods',
      status: '❌ Not Supported',
      alternative: 'Use LOOP nodes in workflow',
      example: 'Instead of items.filter(), use a LOOP node',
    },
    {
      feature: 'Regular Expressions',
      status: '❌ Not Supported',
      alternative: 'Use exact string comparison',
      example: 'status == "ACTIVE" instead of /ACTIVE/i',
    },
    {
      feature: 'Custom Functions',
      status: '❌ Not Supported',
      alternative: 'Use built-in operators only',
      example: 'Use arithmetic operators instead of Math.max()',
    },
    {
      feature: 'Ternary Operator',
      status: '✅ Supported',
      alternative: 'N/A',
      example: 'x > 5 ? "high" : "low" (experimental)',
    },
  ],

  securityRestrictions: {
    blocked: [
      { pattern: 'process.*', reason: 'System access', risk: 'CRITICAL' },
      { pattern: 'require()', reason: 'Module loading', risk: 'CRITICAL' },
      { pattern: 'eval()', reason: 'Code execution', risk: 'CRITICAL' },
      { pattern: 'Function()', reason: 'Dynamic code', risk: 'CRITICAL' },
      { pattern: '__proto__', reason: 'Prototype pollution', risk: 'HIGH' },
      { pattern: 'constructor', reason: 'Constructor access', risk: 'HIGH' },
      { pattern: 'global', reason: 'Global object access', risk: 'HIGH' },
      { pattern: 'this', reason: 'Context access', risk: 'MEDIUM' },
    ],
    limits: [
      { name: 'Max Expression Length', value: '1000 characters', reason: 'Prevent DoS' },
      { name: 'Max Nesting Depth', value: '10 levels', reason: 'Prevent complexity attacks' },
      { name: 'Execution Timeout', value: '5 seconds', reason: 'Prevent infinite loops' },
      { name: 'Rate Limit', value: '10 per minute', reason: 'Prevent abuse' },
    ],
  },

  troubleshooting: [
    {
      error: 'Dangerous pattern detected',
      cause: 'Using blocked keywords like process, require, eval',
      solution: 'Use only allowed operators. Remove system access attempts.',
    },
    {
      error: 'Expression too long',
      cause: 'Condition exceeds 1000 characters',
      solution: 'Simplify condition or split into multiple steps',
    },
    {
      error: 'Expression too complex',
      cause: 'Too many nested parentheses (>10 levels)',
      solution: 'Reduce nesting or use intermediate variables',
    },
    {
      error: 'parse error',
      cause: 'Syntax error in expression',
      solution: 'Check for unmatched quotes, parentheses, or invalid operators',
    },
    {
      error: 'undefined variable',
      cause: 'Variable not available in workflow context',
      solution: 'Ensure variable exists or is passed from previous steps',
    },
  ],

  tips: [
    '💡 Test your conditions with sample data before deploying',
    '💡 Use meaningful variable names for better readability',
    '💡 Keep conditions simple - complex logic can be split into multiple steps',
    '💡 Document complex conditions with comments in your workflow',
    '💡 Use parentheses to make operator precedence explicit',
    '💡 String comparisons are case-sensitive',
    '💡 Numeric comparisons work with integers and decimals',
    '💡 All conditions are logged for security audit',
  ],
};

export default WORKFLOW_SYNTAX_GUIDE;
