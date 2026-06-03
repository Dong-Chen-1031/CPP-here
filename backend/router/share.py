import uuid
from venv import logger

import boto3
import settings
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from router.verify import need_token

router = APIRouter()

s3 = boto3.client(
    service_name="s3",
    endpoint_url=settings.S3_ENDPOINT_URL,
    aws_access_key_id=settings.S3_ACCESS_KEY_ID,
    aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    region_name="auto",
)


class ShareRequest(BaseModel):
    code: str = Field(max_length=65536)


class ShareResponse(BaseModel):
    share_id: str


@router.post("/share")
async def share(
    request: ShareRequest,
    token: dict = Depends(need_token),
) -> ShareResponse:
    if not settings.SHARE:
        raise Exception("Sharing is disabled")
    logger.info(f"Sharing code with content length {len(request.code)}")

    share_id = uuid.uuid7().hex
    s3.put_object(
        Bucket="share",
        Key=f"{share_id}",
        Body=request.code.encode(),
    )

    return ShareResponse(share_id=share_id)
