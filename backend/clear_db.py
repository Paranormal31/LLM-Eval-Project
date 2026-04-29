import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import connect_to_mongo, get_database, close_mongo_connection

async def clear_db():
    await connect_to_mongo()
    db = get_database()
    if db is not None:
        result = await db.runs.delete_many({})
        print(f"Deleted {result.deleted_count} documents from runs collection.")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(clear_db())
