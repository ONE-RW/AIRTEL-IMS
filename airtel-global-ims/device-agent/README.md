# Airtel IMS Device Agent

This folder contains the managed device monitoring agent used by the Airtel IMS IT support dashboard.

## What it does

- Collects CPU, RAM, disk, battery, uptime, latency, packet loss, and temperature telemetry
- Registers the workstation against an Airtel IMS asset tag or the device hostname
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
   Or set `useHostnameAsIdentifier` to `true` and fill `hostname` with the exact `computer_name` stored in IMS.
5. Start the agent:

```bash
python agent.py
```

The agent now retries registration if the backend is temporarily unavailable instead of exiting immediately.

## Useful commands

Run once for a smoke test:

```bash
python agent.py --once
```

Keep the process attached to the current console for debugging:

```bash
python agent.py --foreground
```

Override config from the command line:

```bash
python agent.py --api-url http://localhost:4000 --api-key your-key --asset-tag TAG-1001
```

Use a hostname value that matches the IMS `computer_name` instead of an asset tag:

```bash
python agent.py --api-url http://localhost:4000 --api-key your-key --use-hostname --hostname BRANCH-LAPTOP-12
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

Run the EXE normally:

- Double-clicking `AirtelIMSDeviceAgent.exe` now relaunches it as a background process.
- Logs are written to `agent.log` in the same folder as the EXE.
- Use `AirtelIMSDeviceAgent.exe --foreground` from PowerShell if you want to watch live output.
- A tray icon appears for user-launched background runs with `Open Log` and `Exit Agent`.
- Startup and configuration failures now raise a visible Windows dialog, and retryable connection failures show tray notifications.

Install the same EXE on a managed workstation so it starts automatically at Windows boot:

```powershell
.\dist\AirtelIMSDeviceAgent.exe --install --api-url http://YOUR-IMS-SERVER:4000 --api-key airtel-device-agent-dev-key --asset-tag RW-WH-LAP-003
```

Or install with hostname lookup by entering the hostname that already exists in IMS:

```powershell
.\dist\AirtelIMSDeviceAgent.exe --install --api-url http://YOUR-IMS-SERVER:4000 --api-key airtel-device-agent-dev-key --use-hostname --hostname BRANCH-LAPTOP-12
```

What `--install` does:

- Copies the EXE into `C:\ProgramData\AirtelIMSDeviceAgent`
- Writes `agent-config.json` there
- Registers a Windows Scheduled Task that starts at boot as `SYSTEM`
- Keeps using the same EXE for later background monitoring

Important for `--install`:

- Run the command from an Administrator PowerShell window
- Use one unique `assetTag` per monitored device, or enter the exact `computer_name` already stored in IMS if you use hostname mode
- Make sure the backend URL is reachable from that device

For another device on the network without using `--install`:

1. Copy `AirtelIMSDeviceAgent.exe` to that device.
2. Put an `agent-config.json` file in the same folder as the EXE.
3. Set that config with:
   - the central IMS backend URL reachable over the network
   - the shared API key
   - that device's own asset tag in IMS
4. Run the EXE on that device.

Example `agent-config.json`:

```json
{
  "apiUrl": "http://YOUR-IMS-SERVER:4000",
  "apiKey": "airtel-device-agent-dev-key",
  "assetTag": "RW-WH-LAP-003",
  "interval": 10,
  "logFile": "C:\\ProgramData\\AirtelIMSDeviceAgent\\agent.log"
}
```

Example hostname-based `agent-config.json`:

```json
{
  "apiUrl": "http://YOUR-IMS-SERVER:4000",
  "apiKey": "airtel-device-agent-dev-key",
  "hostname": "BRANCH-LAPTOP-12",
  "useHostnameAsIdentifier": true,
  "interval": 10,
  "logFile": "C:\\ProgramData\\AirtelIMSDeviceAgent\\agent.log"
}
```

Important:

- Every monitored device should use its own `assetTag`
- If you use hostname mode, the configured `hostname` must exactly match the `computer_name` stored in IMS
- The backend must be reachable from the other machine over the network
- Port `4000` must be open to that device if you use the backend directly
- The device will appear in the same IMS monitoring feed after it successfully checks in

## PowerShell installer

If you still want the PowerShell-based installer, build the EXE first and then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-agent.ps1
```

That installer now also registers the agent to start at Windows boot.

## Backend requirements

The IMS backend must define `DEVICE_AGENT_API_KEY` with the same value used by the agent.
For hosted deployments, set `DEVICE_AGENT_API_URL` on the backend to the public URL employees' devices should call, for example `https://ims.airtel.example`.
