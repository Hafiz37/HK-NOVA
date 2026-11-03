import os, subprocess, tempfile, json, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
python = str(root / '.venv/bin/python')
files = ['tests/test_diagnostic_analyzer.py', 'tests/test_auto_fix.py', 'tests/test_retry_logic.py', 'tests/test_backup_failure_flow.py']
runs = [(Path(f).stem, [f, '-v', '--tb=long' if 'failure_flow' in f else '--tb=short', '-s']) for f in files]
runs += [('combined', files + ['-v', '--tb=short', '-s', '--no-header', '-q']), ('coverage_requested', files + ['--cov=app/modules/diagnostic_analyzer', '--cov=app/modules/auto_fix', '--cov=app/modules/retry_service', '--cov=app/routers/diagnostics', '--cov-report=term-missing', '--cov-report=html:htmlcov_diagnostics', '-v'])]
runs += [('coverage_corrected', files + ['--cov=app.modules.diagnostic_analyzer', '--cov=app.modules.auto_fix', '--cov=app.modules.retry_service', '--cov=app.routers.diagnostics', '--cov-report=term-missing', '--cov-report=html:htmlcov_diagnostics', f'--cov-report=json:{out / "coverage.json"}', '-v'])]
if len(sys.argv) > 1:
    runs = [run for run in runs if run[0] in sys.argv[1:]]
results=[]
for name,args in runs:
    with tempfile.TemporaryDirectory(prefix='hk-nova-diagnostics-') as temp:
        env = dict(os.environ, DATABASE_URL=f'sqlite:///{temp}/test.db', BACKUP_DIR=f'{temp}/backups', SSH_KEY_DIR=f'{temp}/ssh_keys', SECRET_KEY='diagnostics-test-only', AUTH_USERNAME='admin', AUTH_PASSWORD='admin', COVERAGE_FILE=str(out / '.coverage'))
        init = subprocess.run([python,'-c','from app.main import app, _ensure_default_destination; from app.database import init_db; init_db(); _ensure_default_destination()'],cwd=root,env=env,capture_output=True,text=True)
        if init.returncode: raise RuntimeError(init.stderr)
        cmd = [python,'-m','pytest',*args,f'--junitxml={out / (name + ".xml")}']
        result=subprocess.run(cmd,cwd=root,env=env,capture_output=True,text=True)
        (out / (name+'.log')).write_text('$ '+' '.join(cmd)+'\n'+result.stdout+result.stderr)
        results.append(dict(name=name,exit_code=result.returncode))
        print(name, result.returncode, result.stdout[-2500:], result.stderr[-1000:],flush=True)
(out/('runs-' + '-'.join(sys.argv[1:]) + '.json' if len(sys.argv)>1 else 'runs.json')).write_text(json.dumps(results,indent=2))
