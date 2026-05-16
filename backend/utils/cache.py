import asyncio
import shutil
import time

from settings import CACHE_EXPIRY, CACHE_LIMIT, CACHE_PATH, CACHE_SQLITE_PATH
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Field, SQLModel, col, select
from utils.log import logger
from utils.scheduler import scheduler


class Catch(
    SQLModel, table=True
):  # TODO: rename to Cache, but my db already has a table named Catch, so I have to keep this name for now
    hash_id: str = Field(default=None, primary_key=True)
    version: str = Field(default="0.1.0")
    timestamp: int = Field(default_factory=lambda: int(time.time()))
    delete_at: int = Field(
        default_factory=lambda: int(time.time()) + CACHE_EXPIRY
    )  # default to delete after 7 days
    use_time: int = Field(default=1)


class BuildStats(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    total_count: int = Field(default=0)
    total_lines: int = Field(default=0)
    total_wasm_size_bytes: int = Field(default=0)
    total_duration_seconds: float = Field(default=0.0)


engine = create_async_engine(CACHE_SQLITE_PATH)

async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def add_cache(hash_id: str):
    async with async_session() as session:
        try:
            cache = Catch(hash_id=hash_id)
            session.add(cache)
            await session.commit()
        except IntegrityError:
            await session.rollback()
            logger.warning(f"Cache entry {hash_id} already exists, skipping.")


async def del_cache(hash_id: str):
    async with async_session() as session:
        try:
            result = await session.get(Catch, hash_id)
            if result:
                await session.delete(result)
                await session.commit()
        except Exception as e:
            logger.error(f"Error deleting cache {hash_id}: {e}")


async def get_cache(hash_id: str) -> Catch | None:
    async with async_session() as session:
        try:
            result = await session.get(Catch, hash_id)
            if result:
                if result.delete_at > int(time.time()):
                    result.use_time += 1
                    result.delete_at = (
                        int(time.time()) + CACHE_EXPIRY
                    )  # extend expiry on access
                    await session.commit()
                    return result
                else:
                    await session.delete(result)
                    await session.commit()
        except Exception as e:
            logger.error(f"Error fetching catch {hash_id}: {e}")
    return None


async def del_oldest_cache(num: int):
    async with async_session() as session:
        try:
            statement = select(Catch).order_by(col(Catch.delete_at)).limit(num)
            result = await session.execute(statement)
            oldest_caches = result.scalars().all()

            for cache in oldest_caches:
                await asyncio.to_thread(
                    shutil.rmtree, f"{CACHE_PATH}/{cache.hash_id}", ignore_errors=True
                )
                await session.delete(cache)
            await session.commit()
        except Exception as e:
            logger.error(f"Error deleting oldest caches: {e}")


async def delete_expired_caches():
    async with async_session() as session:
        try:
            statement = select(Catch).where(Catch.delete_at <= int(time.time()))

            result = await session.execute(statement)
            expired_caches = result.scalars().all()

            for cache in expired_caches:
                await asyncio.to_thread(
                    shutil.rmtree, f"{CACHE_PATH}/{cache.hash_id}", ignore_errors=True
                )
                await session.delete(cache)

            await session.commit()
        except Exception as e:
            logger.error(f"Error deleting expired caches: {e}")


async def cleanup_caches():
    async with async_session() as session:
        try:
            count = (
                await session.execute(select(func.count()).select_from(Catch))
            ).scalar() or 0
            if count > CACHE_LIMIT:
                await del_oldest_cache(count - CACHE_LIMIT)
        except Exception as e:
            logger.error(f"Error cleaning up caches: {e}")


scheduler.add_job(delete_expired_caches, "interval", days=1)
scheduler.add_job(cleanup_caches, "interval", days=1)


async def add_build_stats(lines: int, wasm_size_bytes: int, duration_seconds: float):
    async with async_session() as session:
        try:
            stats = await session.get(BuildStats, 1)
            if stats is None:
                stats = BuildStats(
                    total_count=1,
                    total_lines=lines,
                    total_wasm_size_bytes=wasm_size_bytes,
                    total_duration_seconds=duration_seconds,
                )
                session.add(stats)
            else:
                stats.total_count += 1
                stats.total_lines += lines
                stats.total_wasm_size_bytes += wasm_size_bytes
                stats.total_duration_seconds += duration_seconds
            await session.commit()
        except Exception as e:
            logger.error(f"Error updating build stats: {e}")


async def get_build_stats():
    async with async_session() as session:
        try:
            stats = await session.get(BuildStats, 1)
            if stats is None:
                return BuildStats()
            return stats
        except Exception as e:
            logger.error(f"Error fetching build stats: {e}")
            return BuildStats()
