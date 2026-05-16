from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from utils.log import logger

from backend.utils.cache import get_build_stats

router = APIRouter()


class StatusResponse(BaseModel):
    total_count: int
    total_lines: int
    total_wasm_size_bytes: int
    total_duration_seconds: float


@router.post("/status")
async def status() -> StatusResponse:
    try:
        stats = await get_build_stats()

        return StatusResponse(
            total_count=stats.total_count,
            total_lines=stats.total_lines,
            total_wasm_size_bytes=stats.total_wasm_size_bytes,
            total_duration_seconds=stats.total_duration_seconds,
        )

    except Exception as e:
        logger.warning(f"Failed to get build stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get build stats")
