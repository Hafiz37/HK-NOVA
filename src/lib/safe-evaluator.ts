import { Parser } from 'expr-eval';

export interface EvaluationOptions {
  maxLength?: number;
  maxNestingDepth?: number;
  allowedFunctions?: string[];
  timeout?: number;
}

export class SafeExpressionEvaluator {
  private static readonly DEFAULT_MAX_LENGTH = 1000;
  private static readonly DEFAULT_MAX_NESTING = 10;
  private static readonly DANGEROUS_PATTERNS = [
    /require\s*\(/i,
    /import\s*\(/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
    /process\./i,
    /__proto__/i,
    /constructor\./i,
    /prototype\./i,
    /\.constructor/i,
    /\bthis\b/i,
    /\bglobal\b/i,
    /\bwindow\b/i,
  ];

  constructor(private options: EvaluationOptions = {}) {
    this.options = {
      maxLength: options.maxLength || SafeExpressionEvaluator.DEFAULT_MAX_LENGTH,
      maxNestingDepth: options.maxNestingDepth || SafeExpressionEvaluator.DEFAULT_MAX_NESTING,
      allowedFunctions: options.allowedFunctions || [],
      timeout: options.timeout || 5000,
    };
  }

  /**
   * Validate expression for security issues
   */
  private validate(expression: string): void {
    // Check length
    if (expression.length > this.options.maxLength!) {
      throw new Error(`Expression too long (max ${this.options.maxLength} characters)`);
    }

    // Check for dangerous patterns
    for (const pattern of SafeExpressionEvaluator.DANGEROUS_PATTERNS) {
      if (pattern.test(expression)) {
        throw new Error(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check nesting depth (count parentheses)
    const nestingLevel = (expression.match(/\(/g) || []).length;
    if (nestingLevel > this.options.maxNestingDepth!) {
      throw new Error(`Expression too complex (max ${this.options.maxNestingDepth} nesting levels)`);
    }
  }

  /**
   * Normalize expression syntax for expr-eval compatibility
   * Converts JavaScript-style operators to expr-eval operators
   */
  private normalizeExpression(expression: string): string {
    let normalized = expression;
    
    // Convert && to and
    normalized = normalized.replace(/&&/g, ' and ');
    
    // Convert || to or
    normalized = normalized.replace(/\|\|/g, ' or ');
    
    // Convert ! to not (but not != which is already supported)
    // Replace ! followed by ( or a word character, but not followed by =
    normalized = normalized.replace(/!(?!=)(?=\(|[a-zA-Z_])/g, 'not ');
    
    return normalized;
  }

  /**
   * Evaluate expression safely
   */
  evaluate(expression: string, variables: Record<string, any>): any {
    try {
      // Validate first
      this.validate(expression);

      // Normalize syntax
      const normalized = this.normalizeExpression(expression);

      // Parse and evaluate
      const parser = new Parser();
      const expr = parser.parse(normalized);

      // Evaluate (note: expr-eval is synchronous, timeout handled at workflow level)
      const result = expr.evaluate(variables);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Expression evaluation failed: ${errorMessage}`);
    }
  }

  /**
   * Evaluate boolean condition
   */
  evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      const result = this.evaluate(condition, variables);
      return Boolean(result);
    } catch (error) {
      console.error('Condition evaluation error:', {
        condition,
        variables: Object.keys(variables),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Test if expression is valid (without evaluating)
   */
  static isValid(expression: string): { valid: boolean; error?: string } {
    try {
      const evaluator = new SafeExpressionEvaluator();
      evaluator.validate(expression);
      const normalized = evaluator.normalizeExpression(expression);
      const parser = new Parser();
      parser.parse(normalized);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Quick helper for simple condition evaluation
 */
export function evaluateCondition(condition: string, variables: Record<string, any>): boolean {
  const evaluator = new SafeExpressionEvaluator();
  return evaluator.evaluateCondition(condition, variables);
}

/**
 * Validate expression syntax
 */
export function validateExpression(expression: string): { valid: boolean; error?: string } {
  return SafeExpressionEvaluator.isValid(expression);
}
