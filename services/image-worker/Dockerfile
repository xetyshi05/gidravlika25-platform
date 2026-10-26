FROM python:3.12-slim@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    U2NET_HOME=/models \
    NUMBA_CACHE_DIR=/tmp/numba-cache

ARG U2NET_URL=https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
ARG U2NET_SHA256=8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491

WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir --require-hashes --no-deps -r requirements.lock

# The model is part of the image: the container starts without internet access
# and always runs the same verified file.
COPY fetch_model.py .
RUN mkdir -p "$U2NET_HOME" \
    && U2NET_URL="$U2NET_URL" U2NET_SHA256="$U2NET_SHA256" python fetch_model.py \
    && chmod 0755 "$U2NET_HOME" \
    && chmod 0444 "$U2NET_HOME/u2net.onnx" \
    && rm fetch_model.py

COPY app.py .
RUN useradd --uid 10001 --create-home --home-dir /home/worker worker
USER 10001:10001

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
