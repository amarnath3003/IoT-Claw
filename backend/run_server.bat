@echo off
REM Run IoT-Claw Backend with Python 3.11 (correct environment)
echo Starting IoT-Claw Backend...
C:\Users\Amarnath\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe -m uvicorn app.main:app --reload
pause
