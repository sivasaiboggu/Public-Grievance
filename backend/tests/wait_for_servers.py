"""Bounded readiness check for disposable local/CI browser-test servers."""

import time
import urllib.error
import urllib.request

deadline = time.monotonic() + 45
for url in ("http://localhost:8000/ready", "http://localhost:3000"):
    while True:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    break
        except (urllib.error.URLError, OSError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Test server did not become ready: {url}")
        time.sleep(1)
