import subprocess,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[2]
with open(root/'artifacts/analytics-qa/server.log','w') as log:
    server=subprocess.Popen([str(root/'.venv/bin/python'),str(root/'artifacts/analytics-qa/probe.py'),'serve'],stdout=log,stderr=log)
    try:
        for _ in range(80):
            try:
                urllib.request.urlopen('http://127.0.0.1:5017/login',timeout=1);break
            except Exception:time.sleep(.25)
        subprocess.run(['node',str(root/'artifacts/analytics-qa/browser.cjs')],check=True)
    finally:
        server.terminate();server.wait(timeout=10)
