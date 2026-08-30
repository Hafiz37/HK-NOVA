import { describe, it, expect, beforeEach } from 'vitest';
import { SafeExpressionEvaluator, evaluateCondition, validateExpression } from '../../src/lib/safe-evaluator';

describe('SafeExpressionEvaluator', () => {
  let evaluator: SafeExpressionEvaluator;

  beforeEach(() => {
    evaluator = new SafeExpressionEvaluator();
  });

  describe('Basic Arithmetic Operations', () => {
    it('should evaluate simple addition', () => {
      expect(evaluator.evaluate('2 + 2', {})).toBe(4);
    });

    it('should evaluate subtraction', () => {
      expect(evaluator.evaluate('10 - 5', {})).toBe(5);
    });

    it('should evaluate multiplication', () => {
      expect(evaluator.evaluate('3 * 4', {})).toBe(12);
    });

    it('should evaluate division', () => {
      expect(evaluator.evaluate('10 / 2', {})).toBe(5);
    });

    it('should evaluate modulo', () => {
      expect(evaluator.evaluate('10 % 3', {})).toBe(1);
    });

    it('should evaluate power', () => {
      expect(evaluator.evaluate('2 ^ 3', {})).toBe(8);
    });

    it('should evaluate complex arithmetic', () => {
      expect(evaluator.evaluate('(2 + 3) * 4 - 1', {})).toBe(19);
    });
  });

  describe('Variable Evaluation', () => {
    it('should evaluate single variable', () => {
      expect(evaluator.evaluate('x + 5', { x: 10 })).toBe(15);
    });

    it('should evaluate multiple variables', () => {
      expect(evaluator.evaluate('a * b', { a: 3, b: 4 })).toBe(12);
    });

    it('should evaluate complex expression with variables', () => {
      expect(evaluator.evaluate('(x + y) / 2', { x: 10, y: 20 })).toBe(15);
    });

    it('should handle missing variables by throwing error', () => {
      // expr-eval throws error for missing variables (which is safer)
      expect(() => evaluator.evaluate('x + 5', {})).toThrow(/undefined variable/);
    });
  });

  describe('Comparison Operators', () => {
    it('should evaluate greater than', () => {
      expect(evaluator.evaluateCondition('x > 5', { x: 10 })).toBe(true);
      expect(evaluator.evaluateCondition('x > 5', { x: 3 })).toBe(false);
    });

    it('should evaluate less than', () => {
      expect(evaluator.evaluateCondition('x < 5', { x: 3 })).toBe(true);
      expect(evaluator.evaluateCondition('x < 5', { x: 10 })).toBe(false);
    });

    it('should evaluate greater than or equal', () => {
      expect(evaluator.evaluateCondition('x >= 10', { x: 10 })).toBe(true);
      expect(evaluator.evaluateCondition('x >= 10', { x: 11 })).toBe(true);
      expect(evaluator.evaluateCondition('x >= 10', { x: 9 })).toBe(false);
    });

    it('should evaluate less than or equal', () => {
      expect(evaluator.evaluateCondition('x <= 10', { x: 10 })).toBe(true);
      expect(evaluator.evaluateCondition('x <= 10', { x: 9 })).toBe(true);
      expect(evaluator.evaluateCondition('x <= 10', { x: 11 })).toBe(false);
    });

    it('should evaluate equality', () => {
      expect(evaluator.evaluateCondition('x == 10', { x: 10 })).toBe(true);
      expect(evaluator.evaluateCondition('x == 10', { x: 11 })).toBe(false);
    });

    it('should evaluate inequality', () => {
      expect(evaluator.evaluateCondition('x != 10', { x: 11 })).toBe(true);
      expect(evaluator.evaluateCondition('x != 10', { x: 10 })).toBe(false);
    });
  });

  describe('Boolean Logic', () => {
    it('should evaluate AND operator', () => {
      expect(evaluator.evaluateCondition('x > 5 && y < 10', { x: 10, y: 5 })).toBe(true);
      expect(evaluator.evaluateCondition('x > 5 && y < 10', { x: 10, y: 15 })).toBe(false);
      expect(evaluator.evaluateCondition('x > 5 && y < 10', { x: 3, y: 5 })).toBe(false);
    });

    it('should evaluate OR operator', () => {
      expect(evaluator.evaluateCondition('x > 5 || y > 10', { x: 10, y: 5 })).toBe(true);
      expect(evaluator.evaluateCondition('x > 5 || y > 10', { x: 3, y: 15 })).toBe(true);
      expect(evaluator.evaluateCondition('x > 5 || y > 10', { x: 3, y: 5 })).toBe(false);
    });

    it('should evaluate NOT operator', () => {
      expect(evaluator.evaluateCondition('!(x > 5)', { x: 3 })).toBe(true);
      expect(evaluator.evaluateCondition('!(x > 5)', { x: 10 })).toBe(false);
    });

    it('should evaluate complex boolean logic', () => {
      expect(evaluator.evaluateCondition('(x > 5 && y < 10) || z == 100', { x: 10, y: 5, z: 100 })).toBe(true);
      expect(evaluator.evaluateCondition('(x > 5 && y < 10) || z == 100', { x: 3, y: 5, z: 100 })).toBe(true);
      expect(evaluator.evaluateCondition('(x > 5 && y < 10) || z == 100', { x: 3, y: 5, z: 50 })).toBe(false);
    });
  });

  describe('String Comparison', () => {
    it('should evaluate string equality', () => {
      expect(evaluator.evaluateCondition('status == "ACTIVE"', { status: 'ACTIVE' })).toBe(true);
      expect(evaluator.evaluateCondition('status == "ACTIVE"', { status: 'INACTIVE' })).toBe(false);
    });

    it('should evaluate string inequality', () => {
      expect(evaluator.evaluateCondition('status != "INACTIVE"', { status: 'ACTIVE' })).toBe(true);
      expect(evaluator.evaluateCondition('status != "INACTIVE"', { status: 'INACTIVE' })).toBe(false);
    });
  });

  describe('Security - Dangerous Pattern Detection', () => {
    it('should block process access', () => {
      expect(() => evaluator.evaluate('process.exit(1)', {})).toThrow(/Dangerous pattern/);
    });

    it('should block require calls', () => {
      expect(() => evaluator.evaluate('require("fs")', {})).toThrow(/Dangerous pattern/);
    });

    it('should block import calls', () => {
      expect(() => evaluator.evaluate('import("fs")', {})).toThrow(/Dangerous pattern/);
    });

    it('should block eval calls', () => {
      expect(() => evaluator.evaluate('eval("malicious")', {})).toThrow(/Dangerous pattern/);
    });

    it('should block Function constructor', () => {
      expect(() => evaluator.evaluate('Function("return process")()', {})).toThrow(/Dangerous pattern/);
    });

    it('should block __proto__ access', () => {
      expect(() => evaluator.evaluate('__proto__.polluted = true', {})).toThrow(/Dangerous pattern/);
    });

    it('should block constructor access', () => {
      expect(() => evaluator.evaluate('constructor.constructor("return process")()', {})).toThrow(/Dangerous pattern/);
    });

    it('should block prototype access', () => {
      expect(() => evaluator.evaluate('prototype.polluted = true', {})).toThrow(/Dangerous pattern/);
    });

    it('should block .constructor access', () => {
      expect(() => evaluator.evaluate('obj.constructor("malicious")', {})).toThrow(/Dangerous pattern/);
    });

    it('should block this keyword', () => {
      expect(() => evaluator.evaluate('this.global', {})).toThrow(/Dangerous pattern/);
    });

    it('should block global access', () => {
      expect(() => evaluator.evaluate('global.process.exit()', {})).toThrow(/Dangerous pattern/);
    });

    it('should block window access', () => {
      expect(() => evaluator.evaluate('window.location', {})).toThrow(/Dangerous pattern/);
    });
  });

  describe('Security - DoS Prevention', () => {
    it('should reject expressions that are too long', () => {
      const evaluator = new SafeExpressionEvaluator({ maxLength: 50 });
      const longExpr = 'x + '.repeat(30) + '1';
      expect(() => evaluator.evaluate(longExpr, { x: 1 })).toThrow(/too long/);
    });

    it('should accept expressions within length limit', () => {
      const evaluator = new SafeExpressionEvaluator({ maxLength: 50 });
      const validExpr = 'x + y + z';
      expect(evaluator.evaluate(validExpr, { x: 1, y: 2, z: 3 })).toBe(6);
    });

    it('should reject deeply nested expressions', () => {
      const evaluator = new SafeExpressionEvaluator({ maxNestingDepth: 3 });
      const nested = '((((x))))';
      expect(() => evaluator.evaluate(nested, { x: 1 })).toThrow(/too complex/);
    });

    it('should accept expressions within nesting limit', () => {
      const evaluator = new SafeExpressionEvaluator({ maxNestingDepth: 5 });
      const validNested = '(((x)))';
      expect(evaluator.evaluate(validNested, { x: 1 })).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should return false for undefined variables in conditions', () => {
      expect(evaluator.evaluateCondition('x > 5', {})).toBe(false);
    });

    it('should return false for syntax errors in conditions', () => {
      expect(evaluator.evaluateCondition('invalid syntax }{', {})).toBe(false);
    });

    it('should throw for syntax errors in evaluate()', () => {
      expect(() => evaluator.evaluate('invalid syntax }{', {})).toThrow();
    });

    it('should handle division by zero gracefully', () => {
      expect(evaluator.evaluate('10 / 0', {})).toBe(Infinity);
    });

    it('should handle invalid operations gracefully', () => {
      // This depends on expr-eval behavior
      expect(evaluator.evaluateCondition('x > "string"', { x: 5 })).toBe(false);
    });
  });

  describe('Real-world Use Cases', () => {
    it('should evaluate alert severity condition', () => {
      expect(evaluator.evaluateCondition('severity == "HIGH"', { severity: 'HIGH' })).toBe(true);
    });

    it('should evaluate CPU threshold', () => {
      expect(evaluator.evaluateCondition('cpuUtil > 80', { cpuUtil: 85 })).toBe(true);
      expect(evaluator.evaluateCondition('cpuUtil > 80', { cpuUtil: 75 })).toBe(false);
    });

    it('should evaluate multiple device conditions', () => {
      expect(evaluator.evaluateCondition(
        'severity == "HIGH" && deviceType == "OLT"',
        { severity: 'HIGH', deviceType: 'OLT' }
      )).toBe(true);
    });

    it('should evaluate average calculation', () => {
      expect(evaluator.evaluateCondition(
        '(cpuUtil + memUtil) / 2 > 75',
        { cpuUtil: 80, memUtil: 90 }
      )).toBe(true);
    });

    it('should evaluate range check', () => {
      expect(evaluator.evaluateCondition(
        'value >= 10 && value <= 100',
        { value: 50 }
      )).toBe(true);
    });

    it('should evaluate status check with OR', () => {
      expect(evaluator.evaluateCondition(
        'status == "DOWN" || latency > 1000',
        { status: 'UP', latency: 1500 }
      )).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    describe('evaluateCondition()', () => {
      it('should evaluate conditions correctly', () => {
        expect(evaluateCondition('x > 5', { x: 10 })).toBe(true);
        expect(evaluateCondition('x > 5', { x: 3 })).toBe(false);
      });

      it('should return false for errors', () => {
        expect(evaluateCondition('invalid', {})).toBe(false);
      });
    });

    describe('validateExpression()', () => {
      it('should validate correct expressions', () => {
        expect(validateExpression('x > 5').valid).toBe(true);
        expect(validateExpression('a + b * c').valid).toBe(true);
        expect(validateExpression('status == "ACTIVE"').valid).toBe(true);
      });

      it('should invalidate dangerous expressions', () => {
        const result1 = validateExpression('process.exit(1)');
        expect(result1.valid).toBe(false);
        expect(result1.error).toContain('Dangerous pattern');

        const result2 = validateExpression('require("fs")');
        expect(result2.valid).toBe(false);
        expect(result2.error).toContain('Dangerous pattern');
      });

      it('should invalidate syntax errors', () => {
        const result = validateExpression('invalid syntax }{');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should invalidate too long expressions', () => {
        const longExpr = 'x + '.repeat(500) + '1';
        const result = validateExpression(longExpr);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too long');
      });

      it('should invalidate too complex expressions', () => {
        const complex = '((((((((((((x))))))))))))';
        const result = validateExpression(complex);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('too complex');
      });
    });
  });

  describe('Custom Options', () => {
    it('should respect custom maxLength', () => {
      const evaluator = new SafeExpressionEvaluator({ maxLength: 20 });
      expect(() => evaluator.evaluate('x + y + z + a + b + c', {})).toThrow(/too long/);
    });

    it('should respect custom maxNestingDepth', () => {
      const evaluator = new SafeExpressionEvaluator({ maxNestingDepth: 2 });
      expect(() => evaluator.evaluate('(((x)))', { x: 1 })).toThrow(/too complex/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty expression', () => {
      expect(() => evaluator.evaluate('', {})).toThrow();
    });

    it('should handle whitespace', () => {
      expect(evaluator.evaluate('  2 + 2  ', {})).toBe(4);
    });

    it('should handle negative numbers', () => {
      expect(evaluator.evaluate('-5 + 3', {})).toBe(-2);
    });

    it('should handle floating point', () => {
      expect(evaluator.evaluate('1.5 + 2.5', {})).toBe(4);
    });

    it('should handle zero', () => {
      expect(evaluator.evaluateCondition('x == 0', { x: 0 })).toBe(true);
    });

    it('should handle boolean values', () => {
      expect(evaluator.evaluateCondition('flag', { flag: true })).toBe(true);
      expect(evaluator.evaluateCondition('flag', { flag: false })).toBe(false);
    });
  });
});
