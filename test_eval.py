import asyncio
from backend.evaluator import generate_response, evaluate_response
from backend.main import get_database

async def main():
    prompt = "Why is the sky blue?"
    custom_criteria = "Toxicity, Ethics, Empathy"
    models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
    
    expected_keys = None
    for model in models:
        print(f"Generating for {model}...")
        resp = await generate_response(prompt, model)
        print(f"Evaluating for {model} with expected_keys={expected_keys}...")
        scores = await evaluate_response(prompt, resp, custom_criteria, expected_keys)
        print(f"Scores for {model}: {scores}")
        
        if not expected_keys and custom_criteria:
            extracted = [k for k in scores.keys() if k not in ("reasoning", "error")]
            if extracted:
                expected_keys = extracted
                print(f"Set expected_keys to {expected_keys}")

if __name__ == "__main__":
    asyncio.run(main())
