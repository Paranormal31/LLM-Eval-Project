from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Union, Any
from database import connect_to_mongo, close_mongo_connection, get_database
from evaluator import generate_response, evaluate_response
import uuid

app = FastAPI(title="LLM Evaluation Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

class PromptRunRequest(BaseModel):
    prompt: str
    models: List[str]
    custom_criteria: Optional[str] = None

class BatchRunRequest(BaseModel):
    prompts: List[str]
    models: List[str]
    custom_criteria: Optional[str] = None

class OverrideRequest(BaseModel):
    model: str
    prompt: Optional[str] = None
    new_evaluation: Dict[str, Any]

class RunResponse(BaseModel):
    run_id: str
    status: str

@app.get("/")
def read_root():
    return {"message": "Welcome to the LLM Evaluation Platform API"}

async def process_evaluation(run_id: str, prompt: str, models: List[str], custom_criteria: str = None):
    db = get_database()
    if db is None:
        print("Database not connected!")
        return

    run_doc = {
        "run_id": run_id,
        "prompt": prompt,
        "status": "processing",
        "results": []
    }
    await db.runs.insert_one(run_doc)

    try:
        results = []
        expected_keys = None
        for model in models:
            # 1. Generate Response
            gen_result = await generate_response(prompt, model)
            ai_response = gen_result["response"]
            latency = gen_result["latency"]
            usage = gen_result["usage"]
            
            # 2. Evaluate Response
            scores = await evaluate_response(prompt, ai_response, custom_criteria, expected_keys)
            
            if not expected_keys and custom_criteria:
                extracted = [k for k in scores.keys() if k not in ("reasoning", "error")]
                if extracted:
                    expected_keys = extracted
            
            result_entry = {
                "model": model,
                "response": ai_response,
                "evaluation": scores,
                "latency": latency,
                "usage": usage
            }
            results.append(result_entry)

        # Update the run document with final results
        await db.runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "completed", "results": results}}
        )
        print(f"Run {run_id} completed.")
    except Exception as e:
        print(f"Error processing run {run_id}: {e}")
        await db.runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "failed", "results": [{"model": "System", "response": f"Error: {str(e)}", "evaluation": {"relevance": 0, "accuracy": 0, "safety": 0, "reasoning": "Failed"}}]}}
        )

@app.post("/api/run", response_model=RunResponse)
async def start_run(request: PromptRunRequest, background_tasks: BackgroundTasks):
    """
    Endpoint to submit a prompt to be evaluated across multiple models.
    """
    run_id = str(uuid.uuid4())
    
    # Process the LLM calls in the background so the API returns quickly
    background_tasks.add_task(process_evaluation, run_id, request.prompt, request.models, request.custom_criteria)
    
    return {"run_id": run_id, "status": "processing"}

async def process_batch_evaluation(run_id: str, prompts: List[str], models: List[str], custom_criteria: str = None):
    db = get_database()
    if db is None:
        print("Database not connected!")
        return

    run_doc = {
        "run_id": run_id,
        "prompt": f"Batch Evaluation: {len(prompts)} prompts",
        "is_batch": True,
        "status": "processing",
        "results": []
    }
    await db.runs.insert_one(run_doc)

    try:
        results = []
        expected_keys = None
        for model in models:
            model_responses = []
            total_scores = {}
            
            for prompt in prompts:
                gen_result = await generate_response(prompt, model)
                ai_response = gen_result["response"]
                latency = gen_result["latency"]
                usage = gen_result["usage"]

                scores = await evaluate_response(prompt, ai_response, custom_criteria, expected_keys)
                
                if not expected_keys and custom_criteria:
                    extracted = [k for k in scores.keys() if k not in ("reasoning", "error")]
                    if extracted:
                        expected_keys = extracted
                
                model_responses.append({
                    "prompt": prompt,
                    "response": ai_response,
                    "evaluation": scores,
                    "latency": latency,
                    "usage": usage
                })
                
                for key, val in scores.items():
                    if key == "reasoning": continue
                    if isinstance(val, (int, float)):
                        total_scores[key] = total_scores.get(key, 0.0) + val

            num_prompts = len(prompts)
            avg_scores = {}
            for key, val in total_scores.items():
                avg_scores[key] = round(val / num_prompts, 2) if num_prompts else 0
            avg_scores["reasoning"] = f"Aggregated average score across {num_prompts} prompts."
            
            results.append({
                "model": model,
                "response": f"Batch completed for {num_prompts} prompts. See details below.",
                "evaluation": avg_scores,
                "responses": model_responses
            })

        await db.runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "completed", "results": results}}
        )
        print(f"Batch Run {run_id} completed.")
    except Exception as e:
        print(f"Error processing batch run {run_id}: {e}")
        await db.runs.update_one(
            {"run_id": run_id},
            {"$set": {"status": "failed", "results": [{"model": "System", "response": f"Error: {str(e)}", "evaluation": {"relevance": 0, "accuracy": 0, "safety": 0, "reasoning": "Failed"}}]}}
        )

@app.post("/api/batch-run")
async def start_batch_run(request: BatchRunRequest, background_tasks: BackgroundTasks):
    """
    Endpoint to submit multiple prompts for batch processing.
    """
    prompts_to_run = request.prompts[:5]
    run_id = str(uuid.uuid4())
    
    background_tasks.add_task(process_batch_evaluation, run_id, prompts_to_run, request.models, request.custom_criteria)
        
    return {"message": f"Started batch run for {len(prompts_to_run)} prompts", "run_ids": [run_id]}

@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    run = await db.runs.find_one({"run_id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    return run

@app.get("/api/runs")
async def list_runs():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    runs_cursor = db.runs.find({}, {"_id": 0}).sort("_id", -1).limit(20)
    runs = await runs_cursor.to_list(length=20)
    return runs

@app.post("/api/runs/{run_id}/override")
async def override_scores(run_id: str, req: OverrideRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    run = await db.runs.find_one({"run_id": run_id})
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    results = run.get("results", [])
    updated = False
    
    if run.get("is_batch"):
        for res in results:
            if res["model"] == req.model:
                if req.prompt and "responses" in res:
                    for p_res in res["responses"]:
                        if p_res["prompt"] == req.prompt:
                            p_res["evaluation"] = req.new_evaluation
                            updated = True
                            
                    if updated:
                        total_scores = {}
                        num_prompts = len(res["responses"])
                        for p_res in res["responses"]:
                            for k, v in p_res.get("evaluation", {}).items():
                                if k != "reasoning" and isinstance(v, (int, float)):
                                    total_scores[k] = total_scores.get(k, 0) + v
                        
                        avg_scores = {}
                        for key, val in total_scores.items():
                            avg_scores[key] = round(val / num_prompts, 2) if num_prompts else 0
                        avg_scores["reasoning"] = f"Aggregated average score across {num_prompts} prompts. (Includes RLHF Overrides)"
                        res["evaluation"] = avg_scores
    else:
        for res in results:
            if res["model"] == req.model:
                res["evaluation"] = req.new_evaluation
                updated = True
                break
                
    if not updated:
        raise HTTPException(status_code=404, detail="Target result not found")
        
    await db.runs.update_one(
        {"run_id": run_id},
        {"$set": {"results": results}}
    )
    return {"message": "Scores overridden successfully"}

