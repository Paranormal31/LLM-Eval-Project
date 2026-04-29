# 🌌 Hybrid LLM Evaluation & Benchmarking Platform

An advanced, production-grade benchmarking suite designed to evaluate and compare Large Language Models (LLMs) across cloud-based APIs (Groq) and local inference (Ollama). 

![Dashboard Preview](https://via.placeholder.com/1200x600?text=Hybrid+LLM+Evaluation+Platform+Dashboard)

## 🚀 Key Features

### 1. Hybrid Model Support
*   **Cloud Models:** Integration with Groq API for ultra-fast inference (Llama 3, Mixtral, etc.).
*   **Local Models:** Seamless connection to Ollama for private, local-first evaluation (Qwen, Llama 3.2, TinyLlama).

### 2. Advanced Benchmarking Metrics
*   **Performance Tracking:** Automated measurement of **Latency** (seconds) and **Token Usage** (Prompt/Completion/Total).
*   **Statistical Confidence:** Built-in calculation of **Standard Deviation (±)** to assess model scoring stability across multiple runs.
*   **Cost Efficiency:** Analyze token throughput to optimize for speed and budget.

### 3. Model Leaderboard
*   **Live Rankings:** Dynamically aggregated leaderboard based on historical performance.
*   **Granular Stats:** View average scores, average latency, and total tokens processed per model.

### 4. Human-in-the-loop (RLHF)
*   **Admin Overrides:** Empower human reviewers to validate and override AI-Judge scores with reasoning logs.
*   **Audit Trail:** Persistent storage of overrides in MongoDB for training or verification purposes.

### 5. Side-by-Side Comparison
*   **Split-View Analysis:** Compare two model responses side-by-side with full evaluation breakdowns.
*   **Batch Evaluation:** Process entire datasets (CSV) and analyze results in bulk.

## 🛠️ Tech Stack

*   **Frontend:** Next.js 15+, React, Tailwind CSS, Recharts (Charts), Lucide React (Icons).
*   **Backend:** FastAPI (Python 3.10+).
*   **Database:** MongoDB (NoSQL) via Motor (Async driver).
*   **Local AI:** Ollama.
*   **Cloud AI:** Groq SDK.

## ⚙️ Installation & Setup

### Backend
1. Navigate to the backend folder: `cd backend`
2. Create a virtual environment: `python -m venv venv`
3. Activate it:
   - Windows: `.\venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Configure `.env`:
   ```env
   GROQ_API_KEY=your_key_here
   MONGO_URI=mongodb://localhost:27017
   DATABASE_NAME=llm_eval
   ```
6. Run the server: `uvicorn main:app --reload`

### Frontend
1. Navigate to the frontend folder: `cd frontend`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

## 📊 Evaluation Workflow
1. **Prompt Entry:** Input a single prompt or upload a CSV dataset.
2. **Execution:** The platform sends the prompt to all active cloud and local models.
3. **AI Judging:** A high-capacity model (Gemini/Llama) acts as a judge, scoring responses based on Relevance, Accuracy, and Safety.
4. **Analysis:** Review the results via interactive bar/line charts and the persistent leaderboard.

## 🛡️ License
MIT License - See [LICENSE](LICENSE) for details.
