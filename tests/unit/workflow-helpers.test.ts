import { describe, it, expect } from 'vitest';
import { 
  validateConditionForUI, 
  formatCondition, 
  extractVariables, 
  testCondition,
  CONDITION_EXAMPLES 
} from '../../src/lib/ui/workflow-helpers';

describe('Workflow Helpers (UI)', () => {
  describe('validateConditionForUI', () => {
    it('should validate valid condition', () => {
      const result = validateConditionForUI('x > 5 && y < 10');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty condition', () => {
      const result = validateConditionForUI('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Condition cannot be empty');
      expect(result.suggestion).toBeDefined();
    });

    it('should reject dangerous pattern with helpful suggestion', () => {
      const result = validateConditionForUI('process.exit(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dangerous pattern');
      expect(result.suggestion).toContain('mathematical and logical operators');
    });

    it('should reject syntax error with helpful suggestion', () => {
      const result = validateConditionForUI('invalid syntax }{');
      expect(result.valid).toBe(false);
      expect(result.suggestion).toContain('syntax');
    });
  });

describe('formatCondition', () => {
    it('should format boolean operators for display', () => {
      expect(formatCondition('x > 5 && y < 10')).toBe('x  >  5  AND  y  <  10');
      expect(formatCondition('x > 5 || y < 10')).toBe('x  >  5  OR  y  <  10');
    });

    it('should format comparison operators for display', () => {
      expect(formatCondition('status == "ACTIVE"')).toBe('status  equals  "ACTIVE"');
      expect(formatCondition('status != "DOWN"')).toBe('status  not equals  "DOWN"');
    });
  });

  describe('extractVariables', () => {
    it('should extract variables from condition', () => {
      const vars = extractVariables('x > 5 && y < 10');
      expect(vars).toContain('x');
      expect(vars).toContain('y');
      expect(vars.length).toBe(2);
    });

    it('should exclude boolean keywords', () => {
      const vars = extractVariables('x > 5 and y < 10 or z == true');
      expect(vars).toContain('x');
      expect(vars).toContain('y');
      expect(vars).toContain('z');
      expect(vars).not.toContain('and');
      expect(vars).not.toContain('or');
      expect(vars).not.toContain('true');
    });

    it('should handle duplicate variables', () => {
      const vars = extractVariables('x > 5 && x < 10');
      expect(vars).toEqual(['x']);
    });
  });

  describe('testCondition', () => {
    it('should test condition with valid variables', () => {
      const result = testCondition('x > 5', { x: 10 });
      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
    });

    it('should handle test failure gracefully', () => {
      const result = testCondition('process.exit(1)', {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should test false conditions', () => {
      const result = testCondition('x > 5', { x: 3 });
      expect(result.success).toBe(true);
      expect(result.result).toBe(false);
    });
  });

  describe('CONDITION_EXAMPLES', () => {
    it('should have valid examples in all categories', () => {
      expect(CONDITION_EXAMPLES.length).toBeGreaterThan(0);
      
      CONDITION_EXAMPLES.forEach(category => {
        expect(category.category).toBeDefined();
        expect(category.examples.length).toBeGreaterThan(0);
        
        category.examples.forEach(example => {
          expect(example.label).toBeDefined();
          expect(example.code).toBeDefined();
          expect(example.description).toBeDefined();
          
          // Verify code is valid
          const validation = validateConditionForUI(example.code);
          expect(validation.valid).toBe(true);
        });
      });
    });
  });
});
