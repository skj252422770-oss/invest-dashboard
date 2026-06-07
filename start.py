#!/usr/bin/env python3
"""启动脚本"""
import subprocess, sys, time, os

# 先杀旧进程
os.system("pkill -f 'python3 server.py' 2>/dev/null || true")
time.sleep(1)

# 启动
os.chdir(os.path.expanduser('~/invest-dashboard'))
proc = subprocess.Popen([sys.executable, 'server.py'])
print(f"Server started (PID: {proc.pid})")
print("Open: http://localhost:8888/")
print("Press Ctrl+C to stop")

try:
    proc.wait()
except KeyboardInterrupt:
    print("Stopping...")
    proc.terminate()
    proc.wait()
