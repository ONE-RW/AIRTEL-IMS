# Device Health Agent System

A complete, production-ready system for monitoring device health across multiple locations using AI-powered predictions.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE                              │
│                                                                   │
│  [Device A - Kigali]                                             │
│  agent.py  ──────────┐                                           │
│                       │                                           │
│  [Device B - Nairobi] │    ┌──────────────────┐                 │
│  agent.py  ───────────┼───►│  Central Server   │◄── Dashboard   │
│                       │    │  (Flask + SQLite)  │    (browser)  │
│  [Device C - London]  │    │  + Claude AI       │               │
│  agent.py  ──────────┘    └──────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
device-health-system/
├── central-server/
│   ├── server.py              ← Main Flask API + AI prediction
│   ├── requirements.txt
│   ├── .env.example           ← Copy to .env and fill in
│   └── templates/
│       └── dashboard.html     ← Web dashboard (served by Flask)
│
└── device-agent/
    ├── agent.py               ← Install on every device
    ├── requirements.txt
    ├── device-health-agent.service   ← Linux systemd auto-start
    └── windows-task-scheduler.xml   ← Windows auto-start
```

---

## 🖥 STEP 1: Set up the Central Server

The central server runs on ONE machine (your cloud server, VPS, or a dedicated machine). All device agents send data here.

### Install

```bash
# Clone / copy the central-server folder to your server
cd central-server

# Create virtual environment
python3 -m venv venv
source venv/bin/activate          # Linux/Mac
# venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env   # Fill in your ANTHROPIC_API_KEY and change AGENT_API_KEY
```

### Configure `.env`

```env
AGENT_API_KEY=your-strong-secret-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=sqlite:///device_health.db
```

### Run (development)

```bash
python server.py
# Server starts on http://0.0.0.0:5000
# Dashboard: http://YOUR_SERVER_IP:5000
```

### Run (production with gunicorn)

```bash
gunicorn -w 4 -b 0.0.0.0:5000 server:app
```

### Run as systemd service (Linux production)

```bash
sudo cp device-health-agent.service /etc/systemd/system/central-server.service
# Edit the service file to point to your server.py
sudo systemctl daemon-reload
sudo systemctl enable central-server
sudo systemctl start central-server
```

---

## 💻 STEP 2: Install the Agent on Every Device

Install `device-agent/agent.py` on **each machine** you want to monitor.

### Install

```bash
# Copy agent.py and requirements.txt to each machine
pip install -r requirements.txt
```

### Configure (edit top of agent.py, or use env vars)

```bash
export CENTRAL_SERVER_URL=http://YOUR_SERVER_IP:5000
export AGENT_API_KEY=your-strong-secret-key-here   # Must match server
export DEVICE_LOCATION="Kigali-Office-Floor2"
export SCAN_INTERVAL=60   # seconds between reports
```

### Run manually (test)

```bash
python agent.py
```

### Auto-start on Linux (systemd)

```bash
# Copy agent files to /opt/device-health-agent/
sudo mkdir -p /opt/device-health-agent
sudo cp agent.py requirements.txt /opt/device-health-agent/
pip install -r /opt/device-health-agent/requirements.txt

# Edit the .service file — set CENTRAL_SERVER_URL, AGENT_API_KEY, DEVICE_LOCATION
sudo cp device-health-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable device-health-agent
sudo systemctl start device-health-agent

# Check status
sudo systemctl status device-health-agent
sudo journalctl -u device-health-agent -f
```

### Auto-start on Windows (Task Scheduler)

```powershell
# Copy agent files to C:\device-health-agent\
# Edit windows-task-scheduler.xml if needed, then:
schtasks /Create /XML windows-task-scheduler.xml /TN "DeviceHealthAgent"
```

Or set environment variables in Windows System Properties → Advanced → Environment Variables.

---

## 🌐 STEP 3: Open the Dashboard

Open your browser and go to:

```
http://YOUR_SERVER_IP:5000
```

The dashboard will:
- Show all devices that have sent data
- Display real-time CPU, memory, temperature bars
- Run AI health predictions (Healthy / At Risk / Critical)
- Auto-refresh every 30 seconds
- Show device history charts
- Generate daily AI fleet reports

---

## 📡 API Reference

All endpoints require the `X-API-Key` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/telemetry` | Receive metrics from a device agent |
| GET | `/api/devices/latest` | Latest reading for every device |
| GET | `/api/devices/{id}/history?limit=50` | History for one device |
| POST | `/api/devices/{id}/predict` | Force AI prediction for a device |
| GET | `/api/summary` | Fleet-level summary counts |
| GET | `/api/report/daily` | AI-generated daily fleet report |

---

## 🔒 Security checklist

- [ ] Change `AGENT_API_KEY` from default to a strong random string
- [ ] Put the server behind nginx with HTTPS (Let's Encrypt)
- [ ] Use a firewall to allow only port 443 (HTTPS) from public
- [ ] Use `DATABASE_URL=postgresql://...` for production (not SQLite)
- [ ] Store `.env` securely, never commit it to git

---

## 🗺 Multi-location tips

- Each device sets its own `DEVICE_LOCATION` env var (e.g. "Nairobi-Branch", "London-HQ")
- The dashboard has a location filter to view devices by site
- Use a cloud server (AWS/GCP/DigitalOcean) as the central server so all locations can reach it
- For secure tunnels without opening firewall ports: use [Tailscale](https://tailscale.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

---

## 🧩 Metrics collected by agent

| Metric | Source |
|--------|--------|
| CPU usage % | `psutil.cpu_percent()` |
| Memory usage % | `psutil.virtual_memory()` |
| Battery level % | `psutil.sensors_battery()` |
| Temperature °C | `psutil.sensors_temperatures()` |
| Uptime hours | `psutil.boot_time()` |
| Network latency ms | `ping 8.8.8.8` |
| Packet loss % | `ping -c 10 8.8.8.8` |
| Error count | Windows Event Log / `/var/log/syslog` |
| Workload 1-10 | Computed from CPU + memory + process count |
