from __future__ import annotations

import os
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from io import BytesIO

from fastapi import FastAPI, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove
from starlette.concurrency import run_in_threadpool

MAX_IMAGE_BYTES = 8 * 1024 * 1024
# Same limits as the API (apps/api/src/backoffice/catalog-images.service.ts): the
# worker must stay safe even when it is called directly.
MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_DIMENSION = 8_000

# Pillow raises DecompressionBombError above twice this value while opening the
# file; everything above the limit itself is rejected explicitly below.
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

# The worker has one CPU and a tight memory limit, so images are processed one at
# a time. Waiting requests hold only their compressed body, and the event loop
# stays free for /health.
_inference = threading.BoundedSemaphore(int(os.getenv("IMAGE_WORKER_CONCURRENCY", "1")))
_session_lock = threading.Lock()
_session = None


def get_session():
    global _session
    with _session_lock:
        if _session is None:
            # The model is baked into the image (see Dockerfile), so this never downloads.
            _session = new_session("u2net")
        return _session


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await run_in_threadpool(get_session)
    yield


app = FastAPI(title="Gidravlika image worker", docs_url=None, redoc_url=None, lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def process_image(body: bytes) -> bytes:
    with _inference:
        try:
            with Image.open(BytesIO(body)) as source:
                source.verify()
            with Image.open(BytesIO(body)) as source:
                width, height = source.size
                if max(width, height) > MAX_IMAGE_DIMENSION or width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=400, detail="Image resolution is too large.")
                image = source.convert("RGBA")
        except Image.DecompressionBombError as error:
            raise HTTPException(status_code=400, detail="Image resolution is too large.") from error
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise HTTPException(status_code=400, detail="Image cannot be decoded.") from error

        result = remove(image, session=get_session()).convert("RGBA")
        output = BytesIO()
        result.save(output, format="PNG", optimize=True)
        return output.getvalue()


@app.post("/remove-background")
async def remove_background(request: Request) -> Response:
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Image body is required.")
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 8 MB limit.")
    # CPU-bound work runs in a thread so the event loop keeps serving requests.
    return Response(content=await run_in_threadpool(process_image, body), media_type="image/png")
