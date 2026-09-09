import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  CheckSquare,
  Clock,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { runAllUnitTests, TestResult } from '../../core/tests/unitTests';

interface TestsScreenProps {
  theme: 'dark' | 'light';
}

export const TestsScreen: React.FC<TestsScreenProps> = ({ theme }) => {
  const isLight = theme === 'light';

  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRanAt, setLastRanAt] = useState<number | null>(null);

  const runTests = async () => {
    setIsRunning(true);
    // Simulate brief test execution delay for visual fidelity
    await new Promise(r => setTimeout(r, 200));
    const results = await runAllUnitTests();
    setTests(results);
    setIsRunning(false);
    setLastRanAt(Date.now());
  };

  useEffect(() => {
    runTests();
  }, []);

  const total = tests.length;
  const passedCount = tests.filter(t => t.passed).length;
  const failedCount = total - passedCount;
  const totalDuration = tests.reduce((acc, t) => acc + t.durationMs, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Comprehensive Unit Test Suite</h2>
              <p className="text-xs text-neutral-400">
                {total > 0 ? `${total} automated unit tests verifying State Machine, Safety Tripwires, Adapters, and Emergency Stop.` : 'Automated unit tests verifying State Machine, Safety Tripwires, Adapters, and Emergency Stop.'}
              </p>
            </div>
          </div>

          <button
            onClick={runTests}
            disabled={isRunning}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs"
          >
            {isRunning ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
            <span>{isRunning ? 'Running Tests...' : `Re-Run All ${total || 102} Tests`}</span>
          </button>
        </div>

        {/* Summary Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Total Tests</span>
            <span className="text-xl font-bold font-mono text-neutral-100">{total}</span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Passed</span>
            <span className="text-xl font-bold font-mono text-emerald-400">{passedCount}</span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Failed</span>
            <span className={`text-xl font-bold font-mono ${failedCount > 0 ? 'text-red-400' : 'text-neutral-500'}`}>
              {failedCount}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/60">
            <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Total Duration</span>
            <span className="text-xl font-bold font-mono text-blue-400">{totalDuration.toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      {/* Test Results List */}
      <div className="space-y-2.5">
        {tests.map(test => (
          <div
            key={test.id}
            className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 text-xs ${
              test.passed
                ? 'bg-neutral-900/40 border-neutral-800/70 hover:border-neutral-700'
                : 'bg-red-950/30 border-red-800/60'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-neutral-200">{test.name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-neutral-800 text-neutral-400">
                  {test.category}
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                ID: {test.id} • {test.message}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{test.durationMs}ms</span>
              </span>
              {test.passed ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>PASS</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-[11px] flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>FAIL</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
