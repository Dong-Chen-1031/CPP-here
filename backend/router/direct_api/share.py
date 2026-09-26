import asyncio
import hashlib
import json
from typing import Any, Literal

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from settings import settings
from utils.log import logger
from utils.verify import need_token

router = APIRouter()

s3 = boto3.client(
    service_name="s3",
    endpoint_url=settings.S3_ENDPOINT_URL,
    aws_access_key_id=settings.S3_ACCESS_KEY_ID,
    aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    region_name="auto",
)

# Must stay in sync with frontend/src/pages/api/share.ts so both backends
# produce the same shareId for the same payload.
SHARE_HASH_PREFIX = "v2.0.0;"
SHARE_ID_MIN_LEN = 5
SHARE_KEY_PREFIX = "share/"
SHARE_HASH_METADATA_KEY = "fullhash"

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58_ALPHABET[r] + out
    pad = len(data) - len(data.lstrip(b"\0"))
    return _B58_ALPHABET[0] * pad + out


# Field order and optionality mirror ShareObjectSchema in
# frontend/src/types/share.ts; the hash depends on the serialized key order.
class TestCase(BaseModel):
    id: str
    name: str
    input: str
    expectedOutput: str | None = None


class OutputCase(BaseModel):
    type: Literal["stdout", "err"] | None = None
    testCaseId: str | None = None
    testCaseName: str | None = None
    expectedOutput: str | None = None
    content: str
    status: Literal["running", "ac", "error", "wa", "finished"] | None = None


class ShareObject(BaseModel):
    code: str = Field(max_length=65536)
    testCase: list[TestCase]
    inputData: str
    outputData: list[OutputCase]


def serialize_share_object(share_object: ShareObject) -> str:
    # Equivalent to JSON.stringify: compact separators, no ASCII escaping,
    # and absent optional fields are omitted rather than written as null.
    return json.dumps(
        share_object.model_dump(exclude_none=True),
        separators=(",", ":"),
        ensure_ascii=False,
    )


def hash_share_object(serialized: str) -> str:
    digest = hashlib.sha256(f"{SHARE_HASH_PREFIX}{serialized}".encode()).digest()
    return b58encode(digest)


def fail(status: int, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": message, "details": details},
        headers={"Cache-Control": "no-store"},
    )


def head_share(share_id: str) -> dict[str, str] | None:
    try:
        res = s3.head_object(
            Bucket=settings.S3_BUCKET_NAME, Key=f"{SHARE_KEY_PREFIX}{share_id}"
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise
    return {k.lower(): v for k, v in res.get("Metadata", {}).items()}


def store_share(serialized: str) -> str | None:
    """Store the share and return its id, or None if every id length is taken."""
    full_share_id = hash_share_object(serialized)

    for length in range(SHARE_ID_MIN_LEN, len(full_share_id) + 1):
        share_id = full_share_id[:length]
        metadata = head_share(share_id)
        if metadata is None:
            s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=f"{SHARE_KEY_PREFIX}{share_id}",
                Body=serialized.encode(),
                ContentType="application/json",
                Metadata={SHARE_HASH_METADATA_KEY: full_share_id},
            )
            return share_id
        if metadata.get(SHARE_HASH_METADATA_KEY) == full_share_id:
            return share_id

    return None


@router.post("/share")
async def share(
    request: Request,
    token: bool = Depends(need_token),
):
    try:
        raw = await request.json()
    except ValueError:
        return fail(400, "Invalid JSON")

    try:
        share_object = ShareObject.model_validate(raw)
    except ValidationError as e:
        return fail(
            400,
            "Invalid request body",
            e.errors(include_url=False, include_context=False),
        )

    serialized = serialize_share_object(share_object)
    logger.info(f"Sharing code with content length {len(serialized)}", extra={})

    share_id = await asyncio.to_thread(store_share, serialized)
    if share_id is None:
        logger.error("Every share id length is taken for this payload")
        return fail(500, "Could not allocate a share id")

    return {"success": True, "shareId": share_id}
