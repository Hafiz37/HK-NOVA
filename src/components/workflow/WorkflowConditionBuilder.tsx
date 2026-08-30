'use client';

import { useState } from 'react';
import { ConditionInput } from './ConditionInput';
import { SyntaxGuideModal } from './SyntaxGuideModal';

interface WorkflowConditionBuilderProps {
  value: string;
  onChange: (value: string) => void;
  availableVariables?: Record<string, any>;
  label?: string;
  description?: string;
  required?: boolean;
  className?: string;
}

export function WorkflowConditionBuilder({
  value,
  onChange,
  availableVariables = {},
  label = 'Workflow Condition',
  description,
  required = false,
  className = '',
}: WorkflowConditionBuilderProps) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <div>
          {label && (
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Syntax Guide
        </button>
      </div>

      <ConditionInput
        value={value}
        onChange={onChange}
        variables={availableVariables}
        showExamples={true}
        showSyntaxHelp={true}
        testMode={Object.keys(availableVariables).length > 0}
        label=""
      />

      <SyntaxGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </div>
  );
}

export default WorkflowConditionBuilder;
