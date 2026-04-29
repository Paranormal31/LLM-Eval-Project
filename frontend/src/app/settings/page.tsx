"use client";

import { useState, useEffect } from "react";
import { BrainCircuit, Activity, Database, Trophy, Settings as SettingsIcon, Save, CheckCircle2 } from "lucide-react";

const ALL_MODELS = [
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", type: "cloud" },
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", type: "cloud" },
  { id: "qwen2:0.5b", name: "Qwen 2 (0.5B)", type: "local" },
  { id: "llama3.2:1b", name: "Llama 3.2 (1B)", type: "local" },
  { id: "tinyllama", name: "TinyLlama", type: "local" },
  { id: "tinydolphin", name: "TinyDolphin", type: "local" },
];

export default function Settings() {
  const [selectedModels, setSelectedModels] = useState<string[]>(ALL_MODELS.map(m => m.id));
  const [customCriteria, setCustomCriteria] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("evalSettings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.models) setSelectedModels(parsed.models);
        if (parsed.customCriteria !== undefined) setCustomCriteria(parsed.customCriteria);
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const toggleModel = (id: string) => {
    setSelectedModels(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const saveSettings = () => {
    localStorage.setItem("evalSettings", JSON.stringify({
      models: selectedModels,
      customCriteria: customCriteria
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
          <a href="/" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <Activity size={18} />
            Evaluations
          </a>
          <a href="/?view=leaderboard" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <Trophy size={18} />
            Leaderboard
          </a>
          <a href="/datasets" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <Database size={18} />
            Datasets
          </a>
          <a href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-md bg-purple-600/10 text-purple-400 font-medium transition-colors">
            <SettingsIcon size={18} />
            Settings
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Platform Settings</h2>
          <p className="text-gray-400 mt-1">Configure your LLM-as-a-Judge criteria and active models.</p>
        </header>

        <div className="max-w-4xl space-y-8">
          {/* Custom Judge Criteria */}
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-8">
            <h3 className="text-xl font-semibold mb-2">Custom Judge Criteria</h3>
            <p className="text-gray-400 text-sm mb-6">
              Override the default Relevance, Accuracy, and Safety metrics. Define your own grading rubric below. The LLM Judge will automatically extract your custom categories.
            </p>
            
            <textarea 
              value={customCriteria}
              onChange={(e) => setCustomCriteria(e.target.value)}
              placeholder="e.g. Rate the response on Tone (is it polite?), Code Quality (are there bugs?), and Brevity (is it concise?)."
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-4 text-gray-300 focus:outline-none focus:border-purple-500 min-h-[150px]"
            />
            {customCriteria && (
              <p className="text-xs text-purple-400 mt-2 font-mono">
                Note: The dashboard charts will dynamically read the categories the judge extracts!
              </p>
            )}
          </section>

          {/* Active Models */}
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-8">
            <h3 className="text-xl font-semibold mb-2">Active Models</h3>
            <p className="text-gray-400 text-sm mb-6">
              Select which models to include in your evaluations. Disabling unused models will save API credits and speed up local inference.
            </p>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wider">Cloud (Groq API)</h4>
                <div className="space-y-3">
                  {ALL_MODELS.filter(m => m.type === 'cloud').map(model => (
                    <label key={model.id} className="flex items-center gap-3 p-3 bg-[#18181b] border border-[#27272a] rounded-lg cursor-pointer hover:border-blue-500/50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedModels.includes(model.id)}
                        onChange={() => toggleModel(model.id)}
                        className="w-5 h-5 rounded border-gray-600 text-blue-500 focus:ring-blue-500/20 bg-[#09090b]"
                      />
                      <span className="font-medium text-gray-200">{model.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3 uppercase tracking-wider">Local (Ollama)</h4>
                <div className="space-y-3">
                  {ALL_MODELS.filter(m => m.type === 'local').map(model => (
                    <label key={model.id} className="flex items-center gap-3 p-3 bg-[#18181b] border border-[#27272a] rounded-lg cursor-pointer hover:border-green-500/50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={selectedModels.includes(model.id)}
                        onChange={() => toggleModel(model.id)}
                        className="w-5 h-5 rounded border-gray-600 text-green-500 focus:ring-green-500/20 bg-[#09090b]"
                      />
                      <span className="font-medium text-gray-200">{model.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button 
              onClick={saveSettings}
              disabled={selectedModels.length === 0}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {saved ? (
                <>
                  <CheckCircle2 size={18} /> Saved!
                </>
              ) : (
                <>
                  <Save size={18} /> Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
