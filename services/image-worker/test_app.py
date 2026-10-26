from __future__ import annotations

import asyncio
import threading
import time
from io import BytesIO

import httpx
import pytest
from PIL import Image

import app as worker


def png(width: int, height: int, mode: str = "RGB") -> bytes:
    output = BytesIO()
    Image.new(mode, (width, height)).save(output, format="PNG")
    return output.getvalue()


@pytest.fixture(autouse=True)
def fake_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(worker, "get_session", lambda: object(), raising=False)
    monkeypatch.setattr(worker, "remove", lambda image, session: image)


async def post(body: bytes) -> httpx.Response:
    transport = httpx.ASGITransport(app=worker.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://worker") as client:
        return await client.post("/remove-background", content=body)


def test_returns_a_png_with_alpha():
    response = asyncio.run(post(png(40, 30)))

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    with Image.open(BytesIO(response.content)) as result:
        assert result.mode == "RGBA"
        assert result.size == (40, 30)


@pytest.mark.parametrize(
    ("body", "status"),
    [
        (b"", 400),
        (b"not an image", 400),
        (png(8_001, 1, "L"), 400),
        # Above MAX_IMAGE_PIXELS: Pillow only warns, the worker rejects it itself.
        (png(6_000, 5_000, "L"), 400),
        # Above twice MAX_IMAGE_PIXELS: Pillow raises DecompressionBombError.
        (png(8_000, 7_000, "L"), 400),
        (b"0" * (worker.MAX_IMAGE_BYTES + 1), 413),
    ],
    ids=["empty", "garbage", "too-wide", "bomb-warning", "bomb-error", "too-large"],
)
def test_rejects_unsafe_input_with_a_client_error(body: bytes, status: int):
    assert asyncio.run(post(body)).status_code == status


def test_health_answers_while_an_image_is_processed(monkeypatch: pytest.MonkeyPatch):
    started = threading.Event()
    release = threading.Event()
    started_at: list[float] = []

    def slow_remove(image, session):
        started_at.append(time.monotonic())
        started.set()
        # Blocks the event loop too if processing is not moved to a thread.
        release.wait(timeout=5)
        return image

    monkeypatch.setattr(worker, "remove", slow_remove)

    async def scenario() -> tuple[int, float, int]:
        transport = httpx.ASGITransport(app=worker.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://worker") as client:
            processing = asyncio.create_task(
                client.post("/remove-background", content=png(20, 20))
            )
            await asyncio.to_thread(started.wait, 5)
            health = await client.get("/health")
            answered_after = time.monotonic() - started_at[0]
            release.set()
            return health.status_code, answered_after, (await processing).status_code

    health_status, answered_after, processing_status = asyncio.run(scenario())

    assert health_status == 200
    assert answered_after < 2
    assert processing_status == 200
