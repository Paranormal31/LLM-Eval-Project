import asyncio
import os
from evaluator import generate_response, evaluate_response
from database import connect_to_mongo, close_mongo_connection, get_database

async def main():
    print("Testing MongoDB Connection...")
    await connect_to_mongo()
    db = get_database()
    if db is not None:
        print("MongoDB is accessible!")
    
    print("\nTesting Groq API...")
    prompt = "Explain quantum computing in one sentence."
    print(f"Prompt: {prompt}")
    
    response = await generate_response(prompt, "llama-3.1-8b-instant")
    print(f"\nResponse from llama-3.1-8b-instant: {response}")
    
    print("\nEvaluating Response with llama3-70b-8192 (Judge)...")
    eval_score = await evaluate_response(prompt, response)
    print(f"\nEvaluation Scores: {eval_score}")
    
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(main())
