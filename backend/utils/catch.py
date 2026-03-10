import time

from settings import CATCH_EXPIRY, CATCH_SQLITE_PATH
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Field, SQLModel, col, select
from utils.log import logger


class Catch(SQLModel, table=True):
    hash_id: str = Field(default=None, primary_key=True)
    file_path: str = Field(default=None)
    file_path_glue: str = Field(default=None)
    version: str = Field(default="0.1.0")
    timestamp: int = Field(default_factory=lambda: int(time.time()))
    delete_at: int = Field(
        default_factory=lambda: int(time.time()) + CATCH_EXPIRY
    )  # default to delete after 7 days
    use_time: int = Field(default=1)


engine = create_async_engine(CATCH_SQLITE_PATH)

async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def add_catch(hash_id: str, file_path: str, file_path_glue: str):
    async with async_session() as session:
        catch = Catch(
            hash_id=hash_id, file_path=file_path, file_path_glue=file_path_glue
        )
        session.add(catch)
        await session.commit()


async def get_catch(hash_id: str) -> Catch | None:
    async with async_session() as session:
        try:
            result = await session.get(Catch, hash_id)
            if result:
                if result.delete_at > int(time.time()):
                    result.use_time += 1
                    result.delete_at = (
                        int(time.time()) + CATCH_EXPIRY
                    )  # extend expiry on access
                    await session.commit()
                    return result
                else:
                    await session.delete(result)
                    await session.commit()
        except Exception as e:
            logger.error(f"Error fetching catch {hash_id}: {e}")
    return None


async def del_oldest_catch(num: int):
    async with async_session() as session:
        try:
            statement = select(Catch).order_by(col(Catch.delete_at)).limit(num)
            result = await session.execute(statement)
            oldest_catches = result.scalars().all()

            for catch in oldest_catches:
                await session.delete(catch)
            await session.commit()
        except Exception as e:
            logger.error(f"Error deleting oldest catches: {e}")


async def delete_expired_catches():
    async with async_session() as session:
        try:
            statement = select(Catch).where(Catch.delete_at <= int(time.time()))

            result = await session.execute(statement)
            expired_catches = result.scalars().all()

            for catch in expired_catches:
                await session.delete(catch)
            await session.commit()
        except Exception as e:
            logger.error(f"Error deleting expired catches: {e}")
