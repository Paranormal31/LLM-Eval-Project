import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB_NAME", "llm_eval_platform")

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def connect_to_mongo():
    if MONGODB_URI:
        db_instance.client = AsyncIOMotorClient(MONGODB_URI)
        db_instance.db = db_instance.client[DB_NAME]
        print(f"Connected to MongoDB: {DB_NAME}")
    else:
        print("MONGODB_URI not found in environment variables.")

async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()
        print("Closed MongoDB connection.")

def get_database():
    return db_instance.db
