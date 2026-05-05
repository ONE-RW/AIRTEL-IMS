"""
Device Health Agent - Collector
================================
Install this on EVERY machine you want to monitor.
It collects real system metrics and sends them to the central server.

Install deps:  pip install psutil requests schedule
Run:           python agent.py
Auto-start:    see README.md for systemd / Windows Task Scheduler setup
"""

import os
import sys
import time
import socket
import platform
import subprocess
import json
import logging
import threading
from datetime import datetime, timezone

import psutil
import requests
import schedule

# ─────────────────────────────────────────────
#  CONFIGURATION  (edit these before deploying)
# ─────────────────────────────────────────────
CENTRAL_SERVER_URL = os.getenv("CENTRAL_SERVER_URL", "http://127.0.0.1:5000/")
API_KEY            = os.getenv("AGENT_API_KEY", "changeme-secret-key")
LOCATION           = os.getenv("DEVICE_LOCATION", "Unknown Location")
SCAN_INTERVAL_SEC  = int(os.getenv("SCAN_INTERVAL", "60"))   # how often to send data
LOG_FILE           = "agent.log"
# ─────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),   # fix: explicit UTF-8 for file
        logging.StreamHandler(sys.stdout)                  # fix: stdout handled separately
    ]
)

# Fix: force UTF-8 on the stdout stream handler so the arrow renders on Windows
logging.getLogger().handlers[1].stream = open(
    sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False
)

log = logging.getLogger(__name__)


def get_cpu_usage() -> float:
    return psutil.cpu_percent(interval=1)


def get_memory_usage() -> float:
    return psutil.virtual_memory().percent


def get_battery() -> float:
    batt = psutil.sensors_battery()
    if batt is None:
        return 100.0   # desktop / server with no battery
    return round(batt.percent, 1)


def get_temperature() -> float:
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return 0.0
        # Try common sensor names across platforms
        for key in ("coretemp", "cpu_thermal", "k10temp", "acpitz"):
            if key in temps and temps[key]:
                return round(temps[key][0].current, 1)
        # Fallback: first reading found
        first = next(iter(temps.values()))
        return round(first[0].current, 1) if first else 0.0
    except Exception:
        return 0.0


def get_uptime_hours() -> float:
    boot = psutil.boot_time()
    uptime_sec = time.time() - boot
    return round(uptime_sec / 3600, 2)


def get_network_latency(host: str = "8.8.8.8") -> float:
    """Ping Google DNS and return latency in ms."""
    try:
        if platform.system() == "Windows":
            cmd = ["ping", "-n", "1", "-w", "2000", host]
        else:
            cmd = ["ping", "-c", "1", "-W", "2", host]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        output = result.stdout
        # Parse ms from ping output
        for token in output.split():
            if "time=" in token:
                return float(token.replace("time=", "").replace("ms", ""))
        # Windows fallback
        import re
        match = re.search(r"Average\s*=\s*(\d+)ms", output)
        if match:
            return float(match.group(1))
        return 999.0
    except Exception:
        return 999.0


def get_packet_loss(host: str = "8.8.8.8") -> float:
    """Return packet loss percentage (0-100)."""
    try:
        if platform.system() == "Windows":
            cmd = ["ping", "-n", "10", "-w", "1000", host]
        else:
            cmd = ["ping", "-c", "10", "-W", "1", host]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        output = result.stdout
        import re
        match = re.search(r"(\d+)%\s*(packet\s*loss|loss)", output, re.IGNORECASE)
        if match:
            return float(match.group(1))
        return 0.0
    except Exception:
        return 0.0


def get_error_count() -> int:
    """Count recent system errors from OS logs."""
    try:
        if platform.system() == "Windows":
            import subprocess
            # Query Windows Event Log for errors in last hour
            cmd = [
                "powershell", "-Command",
                "Get-EventLog -LogName System -EntryType Error -Newest 50 | Measure-Object | Select-Object -ExpandProperty Count"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            return int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
        else:
            # Count kernel errors in syslog (last 1000 lines)
            result = subprocess.run(
                ["grep", "-c", "-i", "error", "/var/log/syslog"],
                capture_output=True, text=True, timeout=5
            )
            return int(result.stdout.strip()) if result.stdout.strip().isdigit() else 0
    except Exception:
        return 0


def get_workload_intensity() -> int:
    """
    Compute a 1-10 workload score from CPU + memory + active processes.
    """
    cpu   = psutil.cpu_percent(interval=0.5)
    mem   = psutil.virtual_memory().percent
    procs = len(psutil.pids())
    score = (cpu * 0.5 + mem * 0.3 + min(procs / 30, 10) * 0.2)
    return max(1, min(10, round(score / 10)))


def collect_metrics() -> dict:
    """Gather all metrics for this device."""
    log.info("Collecting metrics...")
    metrics = {
        "device_id":   socket.gethostname(),
        "device_name": socket.gethostname(),
        "location":    LOCATION,
        "platform":    platform.system(),
        "os_version":  platform.version(),
        "ip_address":  socket.gethostbyname(socket.gethostname()),
        "timestamp":   datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),  # fix: timezone-aware UTC
        "cpu":         get_cpu_usage(),
        "memory":      get_memory_usage(),
        "battery":     get_battery(),
        "temperature": get_temperature(),
        "uptime":      get_uptime_hours(),
        "latency":     get_network_latency(),
        "packet_loss": get_packet_loss(),
        "errors":      get_error_count(),
        "workload":    get_workload_intensity(),
    }
    log.info(f"Metrics: CPU={metrics['cpu']}% MEM={metrics['memory']}% TEMP={metrics['temperature']}C")
    return metrics


def send_metrics():
    """Send collected metrics to the central server."""
    try:
        data = collect_metrics()
        response = requests.post(
            f"{CENTRAL_SERVER_URL}/api/telemetry",
            json=data,
            headers={"X-API-Key": API_KEY},
            timeout=10
        )
        if response.status_code == 200:
            log.info(f"Data sent successfully to {CENTRAL_SERVER_URL}")   # fix: removed arrow
        else:
            log.warning(f"Server returned {response.status_code}: {response.text}")
    except requests.exceptions.ConnectionError:
        log.error(f"Cannot reach central server at {CENTRAL_SERVER_URL}. Will retry next cycle.")
    except Exception as e:
        log.error(f"Unexpected error: {e}")


def main():
    log.info("=" * 50)
    log.info(f"Device Health Agent starting on {socket.gethostname()}")
    log.info(f"Central server: {CENTRAL_SERVER_URL}")
    log.info(f"Location: {LOCATION}")
    log.info(f"Scan interval: {SCAN_INTERVAL_SEC}s")
    log.info("=" * 50)

    # Send immediately on startup
    send_metrics()

    # Then on schedule
    schedule.every(SCAN_INTERVAL_SEC).seconds.do(send_metrics)

    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == "__main__":
    main()