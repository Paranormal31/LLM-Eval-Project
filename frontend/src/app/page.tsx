"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { Play, Activity, Database, Settings, ChevronRight, BarChart3, Plus, Minus, BrainCircuit, X, History, Pencil, Check } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface EvalScore {
  relevance: number;
  accuracy: number;
  safety: number;
  reasoning: string;
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface Result {
  model: string;
  response: string;
  evaluation: EvalScore;
  latency?: number;
  usage?: Usage;
  responses?: any[];
}

interface Run {
  run_id: string;
  prompt: string;
  status: string;
  is_batch?: boolean;
  results: Result[];
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPrompt, setNewPrompt] = useState("");
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [historyCount, setHistoryCount] = useState<number>(10);
  
  const [editingScores, setEditingScores] = useState<{runId: string, model: string, prompt?: string} | null>(null);
  const [tempScores, setTempScores] = useState<Record<string, number>>({});
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [view, setView] = useState<'dashboard' | 'leaderboard'>(
    (searchParams.get('view') as any) === 'leaderboard' ? 'leaderboard' : 'dashboard'
  );
  const [compareModels, setCompareModels] = useState<string[]>([]);

  useEffect(() => {
    fetchRuns();
  }, []);

  // Poll for updates if any run is processing
  useEffect(() => {
    const hasProcessing = runs.some(r => r.status === 'processing');
    let interval: NodeJS.Timeout;
    if (hasProcessing) {
      interval = setInterval(() => {
        fetchRuns();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runs]);

  const fetchRuns = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/runs");
      setRuns(res.data);
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitEvaluation = async () => {
    if (!newPrompt) return;
    setTriggerLoading(true);
    
    try {
      const stored = localStorage.getItem("evalSettings");
      let activeModels = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "qwen2:0.5b", "llama3.2:1b", "tinyllama", "tinydolphin"];
      let criteria = undefined;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.models && parsed.models.length > 0) activeModels = parsed.models;
          if (parsed.customCriteria) criteria = parsed.customCriteria;
        } catch(e) {}
      }

      // Check if it's a CSV string (batch run)
      if (newPrompt.includes(",") && newPrompt.split(",").length > 2) {
        const prompts = newPrompt.split(",").map(p => p.trim()).filter(p => p);
        if (prompts.length > 1) {
          // Run batch evaluation
          await axios.post("http://localhost:8000/api/batch-run", {
            prompts,
            models: activeModels,
            custom_criteria: criteria
          });
          setNewPrompt("");
          fetchRuns();
          setTriggerLoading(false);
          return;
        }
      }
      
      // Fallback to normal if not csv formatted
      await axios.post("http://localhost:8000/api/run", {
        prompt: newPrompt,
        models: activeModels,
        custom_criteria: criteria
      });
      setNewPrompt("");
      fetchRuns();
    } catch (error) {
      console.error("Failed to trigger run:", error);
    } finally {
      setTriggerLoading(false);
    }
  };

  const submitOverride = async () => {
    if (!editingScores || !selectedRun) return;
    setIsSubmittingOverride(true);
    try {
      await axios.post(`http://localhost:8000/api/runs/${selectedRun.run_id}/override`, {
        model: editingScores.model,
        prompt: editingScores.prompt,
        new_evaluation: { ...tempScores, reasoning: "Admin Override" }
      });
      setEditingScores(null);
      // Immediately refetch to show updated data
      await fetchRuns();
      // Update the selectedRun to show the new data without closing the modal
      const res = await axios.get(`http://localhost:8000/api/runs/${selectedRun.run_id}`);
      setSelectedRun(res.data);
    } catch (error) {
      console.error("Failed to submit override", error);
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const getHistoricalChartData = (count: number) => {
    const completedRuns = runs.filter(r => r.status === "completed" && r.results && r.results.length > 0);
    const targetRuns = completedRuns.slice(0, count);
    if (targetRuns.length === 0) return [];

    const modelAgg: Record<string, any> = {};

    targetRuns.forEach(run => {
      run.results.forEach((res: any) => {
        if (!modelAgg[res.model]) {
          modelAgg[res.model] = {
            name: res.model.replace("-instant", "").replace("-versatile", "").replace("-32768", ""),
            originalModel: res.model,
            evalSums: {}
          };
        }
        
        if (res.evaluation) {
          Object.entries(res.evaluation).forEach(([k, v]) => {
            if (k !== 'reasoning' && typeof v === 'number') {
              const capKey = k.charAt(0).toUpperCase() + k.slice(1);
              if (!modelAgg[res.model].evalSums[capKey]) {
                modelAgg[res.model].evalSums[capKey] = { sum: 0, count: 0 };
              }
              modelAgg[res.model].evalSums[capKey].sum += v;
              modelAgg[res.model].evalSums[capKey].count += 1;
            }
          });
        }
      });
    });

    return Object.values(modelAgg).map((agg: any) => {
      const base: any = {
        name: agg.name,
        originalModel: agg.originalModel
      };
      Object.entries(agg.evalSums).forEach(([k, v]: [string, any]) => {
        base[k] = Number((v.sum / v.count).toFixed(2));
      });
      return base;
    });
  };

  const getChartData = () => {
    if (runs.length === 0) return [];
    
    // We'll take the most recent completed run with results
    const latestRun = runs.find(r => r.status === "completed" && r.results && r.results.length > 0);
    if (!latestRun) return [];

    return latestRun.results.map(res => {
      const base: any = {
        name: res.model.replace("-instant", "").replace("-versatile", "").replace("-32768", ""),
        originalModel: res.model
      };
      
      if (res.evaluation) {
        Object.entries(res.evaluation).forEach(([k, v]) => {
            if (k !== 'reasoning' && typeof v === 'number') {
                const capKey = k.charAt(0).toUpperCase() + k.slice(1);
                base[capKey] = v;
            }
        });
      }
      return base;
    });
  };

  const calculateLeaderboard = () => {
    const stats: Record<string, { 
      model: string, 
      avgScore: number, 
      scores: number[], 
      latencies: number[], 
      totalRuns: number,
      totalTokens: number
    }> = {};

    runs.filter(r => r.status === "completed").forEach(run => {
      run.results.forEach(res => {
        if (!stats[res.model]) {
          stats[res.model] = { 
            model: res.model, 
            avgScore: 0, 
            scores: [], 
            latencies: [], 
            totalRuns: 0,
            totalTokens: 0
          };
        }
        
        if (res.evaluation) {
          const validScores = Object.entries(res.evaluation)
            .filter(([k, v]) => k !== 'reasoning' && typeof v === 'number')
            .map(([_, v]) => v as number);
          
          if (validScores.length > 0) {
            const avgForRun = validScores.reduce((a, b) => a + b, 0) / validScores.length;
            stats[res.model].scores.push(avgForRun);
          }
        }
        
        if (res.latency) stats[res.model].latencies.push(res.latency);
        if (res.usage?.total_tokens) stats[res.model].totalTokens += res.usage.total_tokens;
        stats[res.model].totalRuns += 1;
      });
    });

    return Object.values(stats).map(s => {
      const avg = s.scores.length > 0 ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0;
      const variance = s.scores.length > 1 
        ? s.scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (s.scores.length - 1)
        : 0;
      const stdDev = Math.sqrt(variance);
      
      return {
        model: s.model,
        displayName: s.model.replace("-instant", "").replace("-versatile", "").replace("-32768", ""),
        avgScore: Number(avg.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        avgLatency: s.latencies.length > 0 
          ? Number((s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length).toFixed(3)) 
          : 0,
        totalRuns: s.totalRuns,
        totalTokens: s.totalTokens
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#27272a] bg-[#09090b] flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-[#27272a]">
          <div className="bg-purple-600 p-2 rounded-lg">
            <BrainCircuit size={20} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">EvalPlatform</h1>
        </div>
        <nav className="p-4 space-y-2 flex-1">
          <button 
            onClick={() => setView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${view === 'dashboard' ? 'bg-purple-600/10 text-purple-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-[#18181b]'}`}
          >
            <Activity size={18} />
            Evaluations
          </button>
          <button 
            onClick={() => setView('leaderboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${view === 'leaderboard' ? 'bg-purple-600/10 text-purple-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-[#18181b]'}`}
          >
            <BarChart3 size={18} />
            Leaderboard
          </button>
          <a href="/datasets" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <Database size={18} />
            Datasets
          </a>
          <a href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <Settings size={18} />
            Settings
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{view === 'dashboard' ? 'Dashboard' : 'Model Leaderboard'}</h2>
            <p className="text-gray-400 mt-1">
              {view === 'dashboard' 
                ? 'Benchmark and analyze LLM outputs.' 
                : 'Aggregated rankings and performance statistics across all evaluations.'}
            </p>
          </div>
          <a href="/datasets" className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-gray-200 transition-colors">
            <Plus size={18} />
            New Dataset
          </a>
        </header>

        {/* Trigger Run Section */}
        <section className="glass-panel rounded-xl p-6 mb-10">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Play size={20} className="text-purple-400" />
            Quick Evaluation
          </h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Enter a prompt to benchmark across models..."
              className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && submitEvaluation()}
            />
            <button 
              onClick={submitEvaluation}
              disabled={triggerLoading || !newPrompt}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {triggerLoading ? "Running..." : "Evaluate"}
              <ChevronRight size={18} />
            </button>
          </div>
          {(triggerLoading || runs.some(r => r.status === 'processing')) && (
            <div className="w-full h-1 mt-6 bg-[#18181b] rounded-full overflow-hidden border border-[#27272a]">
              <div className="h-full bg-purple-500 rounded-full animate-progress"></div>
            </div>
          )}
        </section>

        <div className={view === 'dashboard' ? 'grid grid-cols-3 gap-8' : ''}>
          {view === 'dashboard' ? (
            <>
              <div className="col-span-2 space-y-8">
            {/* Chart Section */}
            <section className="glass-panel rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-400" />
              Latest Benchmark Comparison
            </h3>
            <div className="h-72">
              {getChartData().length > 0 ? (
                (() => {
                  const chartData = getChartData();
                  const ollamaModels = ["qwen2:0.5b", "llama3.2:1b", "tinyllama", "tinydolphin"];
                  const cloudData = chartData.filter(d => !ollamaModels.includes(d.originalModel));
                  const localData = chartData.filter(d => ollamaModels.includes(d.originalModel));
                  
                  const allKeysSet = new Set<string>();
                  chartData.forEach(d => {
                    Object.keys(d).forEach(k => {
                      if (k !== 'name' && k !== 'originalModel' && k !== 'reasoning') {
                        allKeysSet.add(k);
                      }
                    });
                  });
                  const allKeys = Array.from(allKeysSet);
                  const displayKeys = allKeys.length > 0 ? allKeys : ['Relevance', 'Accuracy', 'Safety'];
                  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
                  
                  return (
                    <div className="flex flex-col h-full w-full">
                      <div className="grid grid-cols-3 gap-4 flex-1">
                        <div className="col-span-1 flex flex-col h-full border border-blue-900/30 bg-blue-950/10 rounded-lg p-2 pt-4">
                          <h4 className="text-xs font-semibold text-blue-400 text-center mb-2 uppercase tracking-wider">Cloud (Groq)</h4>
                          <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={cloudData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="name" stroke="#a1a1aa" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} itemSorter={(item) => displayKeys.indexOf(item.dataKey as string)} />
                                {displayKeys.map((key, i) => (
                                  <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="col-span-2 flex flex-col h-full border border-green-900/30 bg-green-950/10 rounded-lg p-2 pt-4">
                          <h4 className="text-xs font-semibold text-green-400 text-center mb-2 uppercase tracking-wider">Local (Ollama)</h4>
                          <div className="flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={localData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="name" stroke="#a1a1aa" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} itemSorter={(item) => displayKeys.indexOf(item.dataKey as string)} />
                                {displayKeys.map((key, i) => (
                                  <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-center gap-6 mt-4 text-xs font-medium text-gray-400">
                        {displayKeys.map((key, i) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }}></span> 
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  No completed runs to display. Run an evaluation above!
                </div>
              )}
            </div>
          </section>

            {/* Historical Average Section */}
            <section className="glass-panel rounded-xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <History size={20} className="text-pink-400" />
                  Historical Average Performance
                </h3>
                <div className="flex items-center gap-3 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1">
                  <span className="text-sm text-gray-400">Last</span>
                  <button onClick={() => setHistoryCount(Math.max(1, historyCount - 1))} className="p-1 hover:bg-[#27272a] rounded text-gray-400 hover:text-white transition-colors">
                    <Minus size={14} />
                  </button>
                  <span className="text-sm font-mono font-medium text-white min-w-[20px] text-center">{historyCount}</span>
                  <button onClick={() => setHistoryCount(historyCount + 1)} className="p-1 hover:bg-[#27272a] rounded text-gray-400 hover:text-white transition-colors">
                    <Plus size={14} />
                  </button>
                  <span className="text-sm text-gray-400">runs</span>
                </div>
              </div>
              
              <div className="h-72">
                {getHistoricalChartData(historyCount).length > 0 ? (
                  (() => {
                    const chartData = getHistoricalChartData(historyCount);
                    const ollamaModels = ["qwen2:0.5b", "llama3.2:1b", "tinyllama", "tinydolphin"];
                    const cloudData = chartData.filter(d => !ollamaModels.includes(d.originalModel));
                    const localData = chartData.filter(d => ollamaModels.includes(d.originalModel));
                    
                    const allKeysSet = new Set<string>();
                    chartData.forEach(d => {
                      Object.keys(d).forEach(k => {
                        if (k !== 'name' && k !== 'originalModel' && k !== 'reasoning') {
                          allKeysSet.add(k);
                        }
                      });
                    });
                    const allKeys = Array.from(allKeysSet);
                    const displayKeys = allKeys.length > 0 ? allKeys : ['Relevance', 'Accuracy', 'Safety'];
                    const colors = ['#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
                    
                    return (
                      <div className="flex flex-col h-full w-full">
                        <div className="grid grid-cols-3 gap-4 flex-1">
                          <div className="col-span-1 flex flex-col h-full border border-pink-900/30 bg-pink-950/10 rounded-lg p-2 pt-4">
                            <h4 className="text-xs font-semibold text-pink-400 text-center mb-2 uppercase tracking-wider">Cloud (Groq)</h4>
                            <div className="flex-1">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={cloudData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                  <XAxis dataKey="name" stroke="#a1a1aa" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                  <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} itemSorter={(item) => displayKeys.indexOf(item.dataKey as string)} />
                                  {displayKeys.map((key, i) => (
                                    <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="col-span-2 flex flex-col h-full border border-orange-900/30 bg-orange-950/10 rounded-lg p-2 pt-4">
                            <h4 className="text-xs font-semibold text-orange-400 text-center mb-2 uppercase tracking-wider">Local (Ollama)</h4>
                            <div className="flex-1">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={localData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                  <XAxis dataKey="name" stroke="#a1a1aa" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                                  <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} itemSorter={(item) => displayKeys.indexOf(item.dataKey as string)} />
                                  {displayKeys.map((key, i) => (
                                    <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-center gap-6 mt-4 text-xs font-medium text-gray-400">
                          {displayKeys.map((key, i) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }}></span> 
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    No completed runs to display.
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Recent Runs Sidebar */}
          <section className="glass-panel rounded-xl p-6">
            <h3 className="text-xl font-semibold mb-6">Recent Runs</h3>
            <div className="space-y-4">
              {loading ? (
                <div className="text-gray-500 animate-pulse">Loading runs...</div>
              ) : runs.length === 0 ? (
                <div className="text-gray-500">No runs found.</div>
              ) : (
                runs.map((run, i) => (
                  <div 
                    key={i} 
                    onClick={() => run.status === 'completed' && setSelectedRun(run)}
                    className={`bg-[#18181b] border border-[#27272a] rounded-lg p-4 transition-colors ${run.status === 'completed' ? 'cursor-pointer hover:border-purple-500' : 'opacity-70'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-gray-400 font-mono">
                        {run.run_id.substring(0, 8)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        run.status === 'completed' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {run.is_batch && <span className="mr-1 font-bold">[BATCH]</span>}
                        {run.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2" title={run.prompt}>
                      "{run.prompt}"
                    </p>
                  </div>
                ))
              )}
                </div>
              </section>
            </>
          ) : (
            <div className="glass-panel rounded-xl p-8 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#27272a] text-gray-400 text-sm">
                      <th className="pb-4 font-semibold">Rank</th>
                      <th className="pb-4 font-semibold">Model</th>
                      <th className="pb-4 font-semibold">Avg Score</th>
                      <th className="pb-4 font-semibold">Confidence (StdDev)</th>
                      <th className="pb-4 font-semibold">Avg Latency</th>
                      <th className="pb-4 font-semibold">Total Runs</th>
                      <th className="pb-4 font-semibold">Total Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculateLeaderboard().map((entry, idx) => (
                      <tr key={`${entry.model}-${idx}`} className="border-b border-[#18181b] hover:bg-[#18181b]/50 transition-colors">
                        <td className="py-4">
                          <span className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                            idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : 
                            idx === 1 ? 'bg-gray-400/20 text-gray-400' : 
                            idx === 2 ? 'bg-amber-600/20 text-amber-600' : 'text-gray-500'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-4 font-medium text-white">{entry.displayName}</td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-lg text-purple-400 font-bold">{entry.avgScore}</span>
                            <div className="flex-1 h-1.5 w-24 bg-[#18181b] rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500" style={{ width: `${(entry.avgScore / 5) * 100}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <span className={`text-sm px-2 py-1 rounded ${entry.stdDev < 0.5 ? 'text-green-400 bg-green-400/10' : entry.stdDev < 1.0 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'}`}>
                            ± {entry.stdDev}
                          </span>
                        </td>
                        <td className="py-4 text-gray-300 font-mono text-sm">{entry.avgLatency}s</td>
                        <td className="py-4 text-gray-300">{entry.totalRuns}</td>
                        <td className="py-4 text-gray-300 text-sm font-mono">{entry.totalTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Details Modal */}
      {selectedRun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-[#27272a] flex justify-between items-center bg-[#18181b]">
              <div>
                <h3 className="text-xl font-bold">Run Details</h3>
                <p className="text-sm text-gray-400 mt-1 font-mono">{selectedRun.run_id}</p>
              </div>
              <button onClick={() => setSelectedRun(null)} className="p-2 hover:bg-[#27272a] rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6 flex justify-between items-center">
                <div className="flex-1 mr-8">
                  <h4 className="text-sm font-semibold text-purple-400 mb-2 uppercase tracking-wider">The Prompt</h4>
                  <div className="bg-[#18181b] p-4 rounded-lg border border-[#27272a]">
                    <p className="text-lg">"{selectedRun.prompt}"</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                   <h4 className="text-xs font-semibold text-gray-500 uppercase">Compare Mode</h4>
                   <div className="flex gap-2">
                     <button 
                        onClick={() => setCompareModels([])}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${compareModels.length === 0 ? 'bg-purple-600 text-white' : 'bg-[#18181b] text-gray-400 hover:text-white'}`}
                     >
                       Single View
                     </button>
                     <button 
                        disabled={selectedRun.results.length < 2}
                        onClick={() => compareModels.length === 0 && setCompareModels([selectedRun.results[0].model, selectedRun.results[1].model])}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${compareModels.length === 2 ? 'bg-purple-600 text-white' : 'bg-[#18181b] text-gray-400 hover:text-white disabled:opacity-50'}`}
                     >
                       Side-by-Side
                     </button>
                   </div>
                </div>
              </div>

              {compareModels.length === 2 ? (
                <div className="grid grid-cols-2 gap-4 h-full">
                  {compareModels.map((modelId, colIdx) => {
                    const result = selectedRun.results.find(r => r.model === modelId);
                    if (!result) return null;
                    return (
                      <div key={`compare-col-${colIdx}`} className="flex flex-col border border-purple-500/30 rounded-lg overflow-hidden bg-[#09090b]">
                        <div className="bg-[#18181b] p-3 border-b border-purple-500/30 flex justify-between items-center">
                          <select 
                            value={modelId}
                            onChange={(e) => {
                              const newCompare = [...compareModels];
                              newCompare[colIdx] = e.target.value;
                              setCompareModels(newCompare);
                            }}
                            className="bg-transparent text-sm font-mono font-bold text-white focus:outline-none cursor-pointer"
                          >
                            {selectedRun.results.map((r, rIdx) => (
                              <option key={`opt-${colIdx}-${r.model}-${rIdx}`} value={r.model} className="bg-[#09090b]">{r.model}</option>
                            ))}
                          </select>
                          <div className="text-[10px] text-gray-500 flex gap-2">
                            {result.latency && <span>{result.latency}s</span>}
                            {result.usage && <span>{result.usage.total_tokens} tokens</span>}
                          </div>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                           <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{result.response}</p>
                        </div>
                        <div className="p-3 bg-[#18181b] border-t border-purple-500/20">
                           <div className="flex gap-1 flex-wrap mb-2">
                              {Object.entries(result.evaluation || {}).filter(([k]) => k !== 'reasoning').map(([k, v]) => (
                                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">{k.toUpperCase()}:{v as number}</span>
                              ))}
                           </div>
                           <p className="text-[11px] text-gray-500 italic line-clamp-2">{result.evaluation?.reasoning}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-blue-400 mb-4 uppercase tracking-wider border-b border-[#27272a] pb-2">Cloud Models (Groq API)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      {selectedRun.results.filter(r => !["qwen2:0.5b", "llama3.2:1b", "tinyllama", "tinydolphin"].includes(r.model)).map((result, idx) => (
                        <div key={idx} className="flex flex-col border border-[#27272a] rounded-lg overflow-hidden">
                          <div className="bg-[#18181b] p-3 border-b border-[#27272a] font-mono text-sm font-semibold flex justify-between items-center">
                            {result.model}
                            <div className="flex gap-2 flex-wrap">
                              {Object.entries(result.evaluation || {}).filter(([k]) => k !== 'reasoning').map(([k, v], i) => {
                                 const colorClasses = [
                                   "bg-purple-500/20 text-purple-300",
                                   "bg-blue-500/20 text-blue-300",
                                   "bg-green-500/20 text-green-300",
                                   "bg-yellow-500/20 text-yellow-300",
                                   "bg-pink-500/20 text-pink-300"
                                 ];
                                 return <span key={k} className={`text-xs px-2 py-1 rounded ${colorClasses[i % colorClasses.length]}`}>{k.substring(0,3).toUpperCase()}:{v as number}</span>
                              })}
                            </div>
                          </div>
                          <div className="p-4 bg-[#09090b] flex-1">
                            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 border-b border-[#18181b] pb-3">
                              {result.latency && (
                                <div className="flex items-center gap-1">
                                  <Activity size={12} className="text-blue-400" />
                                  <span>Latency: <span className="text-gray-300">{result.latency}s</span></span>
                                </div>
                              )}
                              {result.usage && (
                                <div className="flex items-center gap-1">
                                  <Database size={12} className="text-green-400" />
                                  <span>Tokens: <span className="text-gray-300">{result.usage.total_tokens}</span></span>
                                </div>
                              )}
                            </div>
                            {selectedRun.is_batch && result.responses ? (
                              <div className="space-y-4">
                                {result.responses.map((resp: any, i: number) => (
                                  <div key={i} className="border border-[#27272a] rounded p-3 bg-[#18181b]">
                                    <h5 className="text-xs text-purple-400 mb-2 border-b border-[#27272a] pb-1 line-clamp-1">{resp.prompt}</h5>
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">{resp.response}</p>
                                    <div className="text-xs text-gray-500 flex gap-3 border-t border-[#27272a] pt-2 flex-wrap">
                                      {Object.entries(resp.evaluation || {}).filter(([k]) => k !== 'reasoning').map(([k, v]) => (
                                        <span key={k}>{k.substring(0,3).toUpperCase()}: {v as number}</span>
                                      ))}
                                      {resp.latency && <span>TIME: {resp.latency}s</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                <h5 className="text-xs text-gray-500 mb-2 uppercase">AI Output:</h5>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-4">
                                  {result.response}
                                </p>
                                
                                <div className="bg-blue-950/20 border border-blue-900/30 p-3 rounded-lg mb-3">
                                  <h5 className="text-xs text-blue-400 mb-1 font-semibold flex items-center gap-1">
                                    <BrainCircuit size={14} /> Judge Reasoning:
                                  </h5>
                                  <p className="text-xs text-gray-400">
                                    {result.evaluation?.reasoning || "No reasoning provided."}
                                  </p>
                                </div>

                                {/* Admin Override Section */}
                                {editingScores && editingScores.model === result.model && !editingScores.prompt ? (
                                  <div className="bg-amber-950/20 border border-amber-700/40 p-3 rounded-lg mt-2 animate-in">
                                    <h5 className="text-xs text-amber-400 mb-3 font-semibold flex items-center gap-1 uppercase tracking-wider">
                                      <Pencil size={12} /> Admin Override
                                    </h5>
                                    <div className="grid grid-cols-2 gap-3">
                                      {Object.entries(tempScores).map(([key, val]) => (
                                        <div key={key} className="flex items-center gap-2">
                                          <label className="text-xs text-gray-300 w-20 truncate capitalize" title={key}>{key}</label>
                                          <input
                                            type="range" min={1} max={5} step={1}
                                            value={val}
                                            onChange={(e) => setTempScores(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                                            className="flex-1 accent-amber-500 h-1.5 cursor-pointer"
                                          />
                                          <span className="text-xs text-amber-300 font-mono w-4 text-center">{val}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={submitOverride}
                                        disabled={isSubmittingOverride}
                                        className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                                      >
                                        <Check size={12} /> {isSubmittingOverride ? "Saving..." : "Save Override"}
                                      </button>
                                      <button
                                        onClick={() => setEditingScores(null)}
                                        className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-[#27272a] transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const scores: Record<string, number> = {};
                                      Object.entries(result.evaluation || {}).forEach(([k, v]) => {
                                        if (k !== 'reasoning' && typeof v === 'number') scores[k] = v;
                                      });
                                      setTempScores(scores);
                                      setEditingScores({ runId: selectedRun.run_id, model: result.model });
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-300 mt-2 px-2 py-1 rounded hover:bg-amber-950/30 transition-colors"
                                  >
                                    <Pencil size={12} /> Override Scores
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-green-400 mb-4 uppercase tracking-wider border-b border-[#27272a] pb-2">Local Models (Ollama)</h4>
                    <div className="grid grid-cols-2 gap-6">
                      {selectedRun.results.filter(r => ["qwen2:0.5b", "llama3.2:1b", "tinyllama", "tinydolphin"].includes(r.model)).map((result, idx) => (
                        <div key={idx} className="flex flex-col border border-[#27272a] rounded-lg overflow-hidden">
                          <div className="bg-[#18181b] p-3 border-b border-[#27272a] font-mono text-sm font-semibold flex justify-between items-center">
                            {result.model}
                            <div className="flex gap-2 flex-wrap">
                              {Object.entries(result.evaluation || {}).filter(([k]) => k !== 'reasoning').map(([k, v], i) => {
                                 const colorClasses = [
                                   "bg-purple-500/20 text-purple-300",
                                   "bg-blue-500/20 text-blue-300",
                                   "bg-green-500/20 text-green-300",
                                   "bg-yellow-500/20 text-yellow-300",
                                   "bg-pink-500/20 text-pink-300"
                                 ];
                                 return <span key={k} className={`text-xs px-2 py-1 rounded ${colorClasses[i % colorClasses.length]}`}>{k.substring(0,3).toUpperCase()}:{v as number}</span>
                              })}
                            </div>
                          </div>
                          <div className="p-4 bg-[#09090b] flex-1">
                            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 border-b border-[#18181b] pb-3">
                              {result.latency && (
                                <div className="flex items-center gap-1">
                                  <Activity size={12} className="text-blue-400" />
                                  <span>Latency: <span className="text-gray-300">{result.latency}s</span></span>
                                </div>
                              )}
                              {result.usage && (
                                <div className="flex items-center gap-1">
                                  <Database size={12} className="text-green-400" />
                                  <span>Tokens: <span className="text-gray-300">{result.usage.total_tokens}</span></span>
                                </div>
                              )}
                            </div>
                            {selectedRun.is_batch && result.responses ? (
                              <div className="space-y-4">
                                {result.responses.map((resp: any, i: number) => (
                                  <div key={i} className="border border-[#27272a] rounded p-3 bg-[#18181b]">
                                    <h5 className="text-xs text-purple-400 mb-2 border-b border-[#27272a] pb-1 line-clamp-1">{resp.prompt}</h5>
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">{resp.response}</p>
                                    <div className="text-xs text-gray-500 flex gap-3 border-t border-[#27272a] pt-2 flex-wrap">
                                      {Object.entries(resp.evaluation || {}).filter(([k]) => k !== 'reasoning').map(([k, v]) => (
                                        <span key={k}>{k.substring(0,3).toUpperCase()}: {v as number}</span>
                                      ))}
                                      {resp.latency && <span>TIME: {resp.latency}s</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                <h5 className="text-xs text-gray-500 mb-2 uppercase">AI Output:</h5>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-4">
                                  {result.response}
                                </p>
                                
                                <div className="bg-green-950/20 border border-green-900/30 p-3 rounded-lg mb-3">
                                  <h5 className="text-xs text-green-400 mb-1 font-semibold flex items-center gap-1">
                                    <BrainCircuit size={14} /> Judge Reasoning:
                                  </h5>
                                  <p className="text-xs text-gray-400">
                                    {result.evaluation?.reasoning || "No reasoning provided."}
                                  </p>
                                </div>

                                {/* Admin Override Section */}
                                {editingScores && editingScores.model === result.model && !editingScores.prompt ? (
                                  <div className="bg-amber-950/20 border border-amber-700/40 p-3 rounded-lg mt-2 animate-in">
                                    <h5 className="text-xs text-amber-400 mb-3 font-semibold flex items-center gap-1 uppercase tracking-wider">
                                      <Pencil size={12} /> Admin Override
                                    </h5>
                                    <div className="grid grid-cols-2 gap-3">
                                      {Object.entries(tempScores).map(([key, val]) => (
                                        <div key={key} className="flex items-center gap-2">
                                          <label className="text-xs text-gray-300 w-20 truncate capitalize" title={key}>{key}</label>
                                          <input
                                            type="range" min={1} max={5} step={1}
                                            value={val}
                                            onChange={(e) => setTempScores(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                                            className="flex-1 accent-amber-500 h-1.5 cursor-pointer"
                                          />
                                          <span className="text-xs text-amber-300 font-mono w-4 text-center">{val}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={submitOverride}
                                        disabled={isSubmittingOverride}
                                        className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
                                      >
                                        <Check size={12} /> {isSubmittingOverride ? "Saving..." : "Save Override"}
                                      </button>
                                      <button
                                        onClick={() => setEditingScores(null)}
                                        className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-[#27272a] transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      const scores: Record<string, number> = {};
                                      Object.entries(result.evaluation || {}).forEach(([k, v]) => {
                                        if (k !== 'reasoning' && typeof v === 'number') scores[k] = v;
                                      });
                                      setTempScores(scores);
                                      setEditingScores({ runId: selectedRun.run_id, model: result.model });
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-300 mt-2 px-2 py-1 rounded hover:bg-amber-950/30 transition-colors"
                                  >
                                    <Pencil size={12} /> Override Scores
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
