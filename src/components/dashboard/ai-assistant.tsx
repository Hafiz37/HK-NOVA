"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, X, ChevronUp, ChevronDown, HelpCircle, Copy } from "lucide-react";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  result?: unknown;
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.result.explanation,
            timestamp: new Date(),
            result: data.result,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${data.error || 'Failed to process query'}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Failed to connect to AI assistant.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatResult = (result: unknown): React.ReactNode => {
    if (!result || typeof result !== 'object') return null;

    const res = result as { type?: string; data?: unknown };

    switch (res.type) {
      case 'table': {
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length === 0) return null;
        const keys = data.length > 0 ? Object.keys(data[0] as object) : [];
        return (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border border-slate-700 rounded-lg">
              <thead className="bg-slate-800">
                <tr>
                  {keys.map((key) => (
                    <th key={key} className="px-2 py-1 text-left text-slate-300 font-medium">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 10).map((row: unknown, i: number) => {
                  const rowObj = row as Record<string, unknown>;
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
                      {keys.map((key) => (
<td key={key} className="px-2 py-1 text-slate-200">
                          {typeof rowObj[key] === 'object' && rowObj[key] !== null ? JSON.stringify(rowObj[key]) : String(rowObj[key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.length > 10 && <p className="text-xs text-slate-500 mt-1">Showing 10 of {data.length} rows</p>}
          </div>
        );
      }

      case 'summary': {
        const data = res.data as { devices?: { total: number; up: number; down: number }; alerts?: { active: number }; avgLatency?: number } | undefined;
        return (
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400">Devices</p>
              <p className="text-lg font-bold text-white">{data?.devices?.total ?? 0}</p>
              <p className="text-xs text-emerald-400">{data?.devices?.up ?? 0} UP · {data?.devices?.down ?? 0} DOWN</p>
            </div>
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400">Active Alerts</p>
              <p className="text-lg font-bold text-white">{data?.alerts?.active ?? 0}</p>
            </div>
            <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400">Avg Latency</p>
              <p className="text-lg font-bold text-white">
                {data?.avgLatency != null ? `${data.avgLatency.toFixed(1)} ms` : '—'}
              </p>
            </div>
          </div>
        );
      }

      case 'chart': {
        const data = res.data as { device?: { name?: string; ip?: string }; metrics?: unknown[]; hours?: number } | undefined;
        return (
          <div className="mt-2 p-3 bg-slate-800 rounded-lg border border-slate-700 text-sm text-slate-300">
            Chart data available for {data?.device?.name} ({data?.device?.ip})
            <br />{data?.metrics?.length ?? 0} data points over {data?.hours ?? 0}h
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl transition-all ${isOpen ? 'rotate-45' : ''}`}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[60vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-up duration-200">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Bot className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
                <p className="text-xs text-slate-500">Natural language NOC queries</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={messagesEndRef}>
            {messages.length === 0 && (
              <div className="text-center text-slate-500 py-8 space-y-2">
                <p className="text-sm font-medium text-slate-400">Ask me anything about the network</p>
                <div className="flex flex-wrap justify-center gap-1 px-4">
                  {EXAMPLE_QUERIES.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleExampleClick(q)}
                      className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
      const result = msg.result as { type?: string; data?: unknown } | undefined;
      return (
        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] p-3 rounded-2xl ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-none'
                : 'bg-slate-800 text-slate-100 rounded-tl-none'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

            {result && formatResult(result)}

            {result?.type === 'table' && (
              <button
                onClick={() => copyToClipboard(JSON.stringify((result as { data?: unknown }).data, null, 2))}
                className="mt-1 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300"
              >
                <Copy className="w-3 h-3" />
                Copy JSON
              </button>
            )}
          </div>
        </div>
      );
    })}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-300">Thinking...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-950/80">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask: 'Show devices down', 'CPU for router-1 last 6h', 'Forecast memory for switch-01'..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white transition-colors flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              <HelpCircle className="w-3 h-3 inline" /> Try: {'"Show critical alerts, Forecast CPU for core-router, Devices with status DOWN"'}
            </p>
          </form>
        </div>
      )}
    </>
  );
}

// Re-export for use in other components
export const EXAMPLE_QUERIES = [
  'Show all devices',
  'Show devices with status DOWN',
  'Show metrics for router-core-1',
  'Show latency for 10.0.0.1 last 6 hours',
  'Show CPU for switch-01',
  'Show active alerts',
  'Show critical alerts for the last 24 hours',
  'Show alerts for router-core-1',
  'Forecast memory for device core-router for 7 days',
  'What is the system status?',
  'Show summary',
];