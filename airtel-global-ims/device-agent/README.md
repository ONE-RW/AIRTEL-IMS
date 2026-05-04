# Airtel IMS Device Agent

This folder contains the background monitoring agent described in the project document.

## What it does

- Collects CPU, RAM, disk, battery, uptime, latency, packet loss, and temperature telemetry
- Registers the workstation against an Airtel IMS asset tag
- Pushes telemetry to the IMS backend on a schedule
- Receives the latest ML-backed recommendation after each upload

## Setup

1. Install Python 3.10+ on the employee device.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `agent-config.example.json` to `agent-config.json`.
4. Set the correct `assetTag`, `apiUrl`, and `apiKey`.
5. Start the agent:

```bash
python agent.py
```

## Useful commands

Run once for a smoke test:

```bash
python agent.py --once
```

Override config from the command line:

```bash
python agent.py --api-url http://localhost:4000 --api-key your-key --asset-tag TAG-1001
```

## Build a single EXE

Use PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-agent.ps1
```

This produces:

```text
device-agent\dist\AirtelIMSDeviceAgent.exe
```

Run the EXE directly:

```powershell
.\dist\AirtelIMSDeviceAgent.exe --once
```

## Backend requirements

The IMS backend must define `DEVICE_AGENT_API_KEY` with the same value used by the agent.
