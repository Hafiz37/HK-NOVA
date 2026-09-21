#!/bin/bash
cd /home/gopal-ichiro/Documents/magang/hk-nova
source .venv/bin/activate
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 5005
