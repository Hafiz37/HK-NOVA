"""Start disposable UI server, capture a walkthrough, then stop the server."""
import subprocess
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = Path(__file__).parent
with (out / 'server.log').open('w') as log:
    server = subprocess.Popen([str(root / '.venv/bin/python'), str(out / 'serve.py')], cwd=root, stdout=log, stderr=log)
    try:
        for _ in range(80):
            try:
                urllib.request.urlopen('http://127.0.0.1:5027/login', timeout=1)
                break
            except Exception:
                if server.poll() is not None:
                    raise RuntimeError('UI server exited; see server.log')
                time.sleep(0.25)
        subprocess.run(['node', str(out / 'browser.cjs')], cwd=root, check=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
