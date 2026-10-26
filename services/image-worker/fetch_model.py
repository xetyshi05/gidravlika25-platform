"""Downloads the u2net model at image build time and verifies its SHA-256.

The expected hash matches the file rembg itself pins (md5 60024c5c889badc19c04ad937298a77b).
"""

from __future__ import annotations

import hashlib
import os
import sys
import urllib.request

URL = os.environ["U2NET_URL"]
EXPECTED_SHA256 = os.environ["U2NET_SHA256"]
TARGET = os.path.join(os.environ["U2NET_HOME"], "u2net.onnx")


def main() -> int:
    partial = f"{TARGET}.part"
    digest = hashlib.sha256()
    with urllib.request.urlopen(URL, timeout=60) as response, open(partial, "wb") as output:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    actual = digest.hexdigest()
    if actual != EXPECTED_SHA256:
        os.remove(partial)
        print(f"u2net.onnx checksum mismatch: {actual} != {EXPECTED_SHA256}", file=sys.stderr)
        return 1
    os.replace(partial, TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
