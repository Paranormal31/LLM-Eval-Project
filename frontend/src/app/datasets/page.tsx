"use client";

import { useState } from "react";
import { BrainCircuit, Activity, Database, Trophy, Settings as SettingsIcon, Upload, Play, CheckCircle2, FileText, ChevronRight } from "lucide-react";
import axios from "axios";
import { useRouter } from "next/navigation";

export default function Datasets() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) return;
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      let pIdx = headers.indexOf('prompt');
      if (pIdx === -1) pIdx = 0; // fallback to first column
      
      const extracted = lines.slice(1).map(line => {
          // split by comma, ignoring commas inside quotes
          const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          let p = cols[pIdx] || "";
          return p.replace(/^"|"$/g, '').trim();
      }).filter(p => p);
      
      setPrompts(extracted);
    } catch (error) {
      console.error("Error parsing CSV:", error);
      alert("Failed to parse the file. Please ensure it's a valid CSV.");
    }
  };

  const startBatchRun = async () => {
    if (prompts.length === 0) return;
    setLoading(true);
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

      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/batch-run`, {
        prompts: prompts,
        models: activeModels,
        custom_criteria: criteria
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error("Batch run failed:", error);
      alert("Failed to start batch evaluation.");
    } finally {
      setLoading(false);
    }
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
          <a href="/datasets" className="flex items-center gap-3 px-4 py-3 rounded-md bg-purple-600/10 text-purple-400 font-medium transition-colors">
            <Database size={18} />
            Datasets
          </a>
          <a href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-md text-gray-400 hover:text-white hover:bg-[#18181b] transition-colors">
            <SettingsIcon size={18} />
            Settings
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Datasets & Batch Run</h2>
          <p className="text-gray-400 mt-1">Upload a dataset of prompts to evaluate in bulk.</p>
        </header>

        <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-8 mb-8 max-w-4xl">
          <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Upload size={20} className="text-purple-400" />
            Upload CSV Dataset
          </h3>
          
          <div className="border-2 border-dashed border-[#27272a] rounded-xl p-10 text-center hover:bg-[#18181b] transition-colors relative">
            <input 
              type="file" 
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <FileText size={48} className="text-gray-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-300 mb-2">Drag and drop your CSV file here</p>
            <p className="text-sm text-gray-500">or click to browse from your computer</p>
            <p className="text-xs text-purple-400 mt-4 font-mono">Note: Ensure your CSV has a "prompt" column header.</p>
          </div>

          {file && (
            <div className="mt-6 flex items-center justify-between bg-[#18181b] border border-[#27272a] p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="text-blue-400" size={24} />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-gray-400">Found {prompts.length} prompts</p>
                </div>
              </div>
              
              {!success ? (
                <button 
                  onClick={startBatchRun}
                  disabled={loading || prompts.length === 0}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  {loading ? "Initializing..." : "Start Batch Evaluation"}
                  {!loading && <Play size={16} />}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-green-400 font-medium">
                  <CheckCircle2 size={20} />
                  Batch Started! Redirecting...
                </div>
              )}
            </div>
          )}
        </section>

        {prompts.length > 0 && (
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-8 max-w-4xl">
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Database size={20} className="text-blue-400" />
              Preview Prompts (Max 5 processed for Demo)
            </h3>
            
            <div className="space-y-3">
              {prompts.slice(0, 10).map((p, idx) => (
                <div key={idx} className="bg-[#18181b] border border-[#27272a] p-4 rounded-lg flex gap-4">
                  <span className="text-gray-500 font-mono text-sm mt-0.5">{idx + 1}.</span>
                  <p className="text-gray-300 text-sm leading-relaxed">{p}</p>
                </div>
              ))}
              {prompts.length > 10 && (
                <div className="text-center text-sm text-gray-500 pt-2">
                  ...and {prompts.length - 10} more prompts.
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
