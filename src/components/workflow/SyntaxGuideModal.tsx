'use client';

import { useState } from 'react';
import { WORKFLOW_SYNTAX_GUIDE } from '@/lib/ui/workflow-syntax-guide';

interface SyntaxGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyntaxGuideModal({ isOpen, onClose }: SyntaxGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'operators' | 'examples' | 'mistakes' | 'security'>('examples');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {WORKFLOW_SYNTAX_GUIDE.title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {WORKFLOW_SYNTAX_GUIDE.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex space-x-4 px-6">
              {[
                { id: 'examples', label: 'Examples' },
                { id: 'operators', label: 'Operators' },
                { id: 'mistakes', label: 'Common Mistakes' },
                { id: 'security', label: 'Security' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    py-3 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Examples Tab */}
            {activeTab === 'examples' && (
              <div className="space-y-6">
                {Object.entries(WORKFLOW_SYNTAX_GUIDE.examples).map(([level, examples]) => (
                  <div key={level}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize mb-3">
                      {level} Examples
                    </h3>
                    <div className="space-y-4">
                      {examples.map((example, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            {example.title}
                          </h4>
                          <code className="block bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 font-mono text-sm text-gray-800 dark:text-gray-200 mb-2">
                            {example.code}
                          </code>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {example.explanation}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            <span className="font-medium">Use case:</span> {example.useCase}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Operators Tab */}
            {activeTab === 'operators' && (
              <div className="space-y-6">
                {Object.entries(WORKFLOW_SYNTAX_GUIDE.operators).map(([type, operators]) => (
                  <div key={type}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize mb-3">
                      {type} Operators
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Operator
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Example
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Result
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {operators.map((op, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <code className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {op.symbol}
                                </code>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                {op.name}
                              </td>
                              <td className="px-4 py-3">
                                <code className="text-sm font-mono text-gray-800 dark:text-gray-200">
                                  {op.example}
                                </code>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {op.result}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Common Mistakes Tab */}
            {activeTab === 'mistakes' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Common Mistakes to Avoid
                </h3>
                {WORKFLOW_SYNTAX_GUIDE.commonMistakes.map((item, idx) => (
                  <div key={idx} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 dark:text-red-100 mb-3">
                      ❌ {item.mistake}
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Wrong:</p>
                        <code className="block bg-white dark:bg-gray-800 px-3 py-2 rounded border border-red-300 dark:border-red-700 font-mono text-sm text-red-800 dark:text-red-200">
                          {item.wrong}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Correct:</p>
                        <code className="block bg-white dark:bg-gray-800 px-3 py-2 rounded border border-green-300 dark:border-green-700 font-mono text-sm text-green-800 dark:text-green-200">
                          {item.correct}
                        </code>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                        {item.explanation}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Best Practices
                  </h3>
                  <div className="space-y-2">
                    {WORKFLOW_SYNTAX_GUIDE.bestPractices.map((practice, idx) => (
                      <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                          ✅ {practice.title}
                        </h4>
                        <div className="grid grid-cols-2 gap-4 mb-2">
                          <div>
                            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Do:</p>
                            <code className="block bg-white dark:bg-gray-800 px-2 py-1 rounded font-mono text-xs text-green-800 dark:text-green-200">
                              {practice.do}
                            </code>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Don't:</p>
                            <code className="block bg-white dark:bg-gray-800 px-2 py-1 rounded font-mono text-xs text-red-800 dark:text-red-200">
                              {practice.dont}
                            </code>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {practice.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Security Overview
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                      {WORKFLOW_SYNTAX_GUIDE.overview.summary}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {WORKFLOW_SYNTAX_GUIDE.overview.security.map((item, idx) => (
                        <li key={idx} className="text-gray-700 dark:text-gray-300">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Blocked Patterns
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Pattern
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Reason
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Risk
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {WORKFLOW_SYNTAX_GUIDE.securityRestrictions.blocked.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3">
                              <code className="text-sm font-mono text-red-600 dark:text-red-400">
                                {item.pattern}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              {item.reason}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`
                                inline-flex px-2 py-1 text-xs font-medium rounded
                                ${item.risk === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : ''}
                                ${item.risk === 'HIGH' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' : ''}
                                ${item.risk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : ''}
                              `}>
                                {item.risk}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Security Limits
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {WORKFLOW_SYNTAX_GUIDE.securityRestrictions.limits.map((limit, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {limit.name}
                        </h4>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-1">
                          {limit.value}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {limit.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-900">
            <button
              onClick={onClose}
              className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SyntaxGuideModal;
