'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  validateConditionForUI, 
  highlightCondition,
  extractVariables,
  testCondition,
  CONDITION_EXAMPLES,
  ALLOWED_OPERATORS,
  type ConditionValidationResult 
} from '@/lib/ui/workflow-helpers';

interface ConditionInputProps {
  value: string;
  onChange: (value: string) => void;
  variables?: Record<string, any>;
  placeholder?: string;
  label?: string;
  description?: string;
  showExamples?: boolean;
  showSyntaxHelp?: boolean;
  testMode?: boolean;
  className?: string;
}

export function ConditionInput({
  value,
  onChange,
  variables = {},
  placeholder = 'Enter condition (e.g., x > 5 && y < 10)',
  label = 'Condition',
  description,
  showExamples = true,
  showSyntaxHelp = true,
  testMode = false,
  className = '',
}: ConditionInputProps) {
  const [validation, setValidation] = useState<ConditionValidationResult>({ valid: true });
  const [showHelp, setShowHelp] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; result?: boolean; error?: string } | null>(null);
  const [usedVariables, setUsedVariables] = useState<string[]>([]);

  // Validate on change
  useEffect(() => {
    if (value) {
      const result = validateConditionForUI(value);
      setValidation(result);
      
      // Extract variables
      const vars = extractVariables(value);
      setUsedVariables(vars);
    } else {
      setValidation({ valid: true });
      setUsedVariables([]);
    }
  }, [value]);

  const handleTest = useCallback(() => {
    if (!value) return;
    
    const result = testCondition(value, variables);
    setTestResult(result);
  }, [value, variables]);

  const insertExample = useCallback((example: string) => {
    onChange(example);
  }, [onChange]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {showSyntaxHelp && (
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="ml-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              {showHelp ? 'Hide' : 'Show'} Syntax Help
            </button>
          )}
        </label>
      )}

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}

      {/* Input Field */}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full px-3 py-2 border rounded-md font-mono text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500
            ${validation.valid 
              ? 'border-gray-300 dark:border-gray-600' 
              : 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
            }
            dark:bg-gray-800 dark:text-gray-100
          `}
        />
        
        {/* Validation Icon */}
        <div className="absolute right-3 top-2.5">
          {value && (
            validation.valid ? (
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )
          )}
        </div>
      </div>

      {/* Validation Error */}
      {!validation.valid && validation.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-200 font-medium">
            Error: {validation.error}
          </p>
          {validation.suggestion && (
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              💡 {validation.suggestion}
            </p>
          )}
        </div>
      )}

      {/* Used Variables */}
      {usedVariables.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Variables used:</span>
          {usedVariables.map((varName) => {
            const isDefined = varName in variables;
            return (
              <span
                key={varName}
                className={`
                  inline-flex items-center px-2 py-1 rounded text-xs font-mono
                  ${isDefined 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                  }
                `}
              >
                {varName}
                {!isDefined && (
                  <svg className="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Test Mode */}
      {testMode && validation.valid && value && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleTest}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Test Condition
          </button>
          
          {testResult && (
            <div className={`
              p-3 rounded-md border
              ${testResult.success 
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }
            `}>
              {testResult.success ? (
                <>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Result: {testResult.result ? '✅ true' : '❌ false'}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Condition evaluated successfully
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-red-900 dark:text-red-100">
                    Test Failed
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {testResult.error}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Syntax Help */}
      {showHelp && showSyntaxHelp && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md space-y-3">
          <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Quick Syntax Reference</h4>
          
          {/* Operators */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Operators:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">Comparison:</span>
                <span className="ml-2 font-mono text-gray-800 dark:text-gray-200">
                  &gt; &lt; &gt;= &lt;= == !=
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">Logical:</span>
                <span className="ml-2 font-mono text-gray-800 dark:text-gray-200">
                  &amp;&amp; || !
                </span>
              </div>
            </div>
          </div>

          {/* Examples */}
          {showExamples && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Examples:</p>
              <div className="space-y-1">
                {CONDITION_EXAMPLES[0].examples.slice(0, 3).map((example, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => insertExample(example.code)}
                    className="block w-full text-left px-2 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  >
                    <span className="text-gray-800 dark:text-gray-200">{example.code}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-[10px] block mt-0.5">
                      {example.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConditionInput;
