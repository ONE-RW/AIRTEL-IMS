from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import sys
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any
from urllib import error, parse, request

import psutil


AGENT_VERSION = "1.0.0"
DEFAULT_CONFIG_PATH = Path(__file__).with_name("agent-config.json")


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_setting(cli_value: Any, config: dict[str, Any], env_key: str, config_key: str, default: Any = None) -> Any:
    if cli_value not in (None, ""):
        return cli_value
    if os.getenv(env_key) not in (None, ""):
        return os.getenv(env_key)
    if config.get(config_key) not in (None, ""):
        return config.get(config_key)
    return default


def build_device_uuid(asset_tag: str) -> str:
    machine_node = hex(uuid.getnode())
    namespace_seed = f"{platform.node()}::{machine_node}::{asset_tag}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, namespace_seed))


def get_hostname() -> str:
    return platform.node() or socket.gethostname() or "unknown-host"


def get_operating_system() -> str:
    return f"{platform.system()} {platform.release()}".strip()


def get_primary_disk_path() -> str:
    if os.name == "nt":
        return os.environ.get("SystemDrive", "C:") + "\\"
    return "/"


def measure_network(api_url: str, attempts: int = 3, timeout: float = 2.0) -> tuple[float | None, float | None]:
    parsed = parse.urlparse(api_url)
    host = parsed.hostname
    if not host:
        return None, None

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    latencies: list[float] = []
    failures = 0

    for _ in range(attempts):
        started = time.perf_counter()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            latencies.append((time.perf_counter() - started) * 1000)
        except OSError:
            failures += 1
        finally:
            sock.close()

    if not latencies and failures == attempts:
        return None, 100.0

    packet_loss = (failures / attempts) * 100
    average_latency = sum(latencies) / len(latencies) if latencies else None
    return average_latency, packet_loss


def first_temperature() -> float | None:
    try:
        sensors = psutil.sensors_temperatures() or {}
    except Exception:
        return None

    for entries in sensors.values():
        for entry in entries:
            current = getattr(entry, "current", None)
            if current is not None:
                return float(current)
    return None


def collect_metrics(api_url: str, history: dict[str, deque[float]], failure_count: int) -> dict[str, Any]:
    cpu_usage = float(psutil.cpu_percent(interval=1))
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage(get_primary_disk_path())
    try:
        battery = psutil.sensors_battery()
    except Exception:
        battery = None
    boot_time = psutil.boot_time()
    uptime_seconds = max(int(time.time() - boot_time), 0)
    network_latency, packet_loss = measure_network(api_url)
    temperature = first_temperature()

    history["cpu"].append(cpu_usage)
    history["ram"].append(float(memory.percent))

    battery_level = float(battery.percent) if battery else None
    battery_health = float(battery.percent) if battery else None
    disk_health = max(0.0, 100.0 - float(disk.percent))
    workload_intensity = (sum(history["cpu"]) / len(history["cpu"]) + sum(history["ram"]) / len(history["ram"])) / 2

    return {
        "cpuUsage": round(cpu_usage, 2),
        "ramUsage": round(float(memory.percent), 2),
        "diskUsage": round(float(disk.percent), 2),
        "diskHealth": round(disk_health, 2),
        "batteryHealth": round(battery_health, 2) if battery_health is not None else None,
        "batteryLevel": round(battery_level, 2) if battery_level is not None else None,
        "networkLatency": round(network_latency, 2) if network_latency is not None else None,
        "packetLoss": round(packet_loss, 2) if packet_loss is not None else None,
        "temperature": round(temperature, 2) if temperature is not None else None,
        "uptimeSeconds": uptime_seconds,
        "workloadIntensity": round(workload_intensity, 2),
        "errorCount": int(failure_count),
    }


def post_json(url: str, payload: dict[str, Any], api_key: str, timeout: float = 10.0) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-device-agent-key": api_key,
        },
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url: str, api_key: str, timeout: float = 10.0) -> dict[str, Any]:
    req = request.Request(
        url,
        headers={
            "x-device-agent-key": api_key,
        },
        method="GET",
    )
    with request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Airtel IMS device monitoring agent.")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to a JSON config file.")
    parser.add_argument("--api-url", help="IMS backend base URL, for example http://localhost:4000.")
    parser.add_argument("--api-key", help="Shared device agent API key.")
    parser.add_argument("--asset-tag", help="Equipment asset tag used to match the workstation.")
    parser.add_argument("--interval", type=int, help="Telemetry push interval in seconds.")
    parser.add_argument("--once", action="store_true", help="Send one telemetry payload and exit.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(Path(args.config))

    api_url = str(get_setting(args.api_url, config, "DEVICE_AGENT_API_URL", "apiUrl", "http://127.0.0.1:4000")).rstrip("/")
    api_key = str(get_setting(args.api_key, config, "DEVICE_AGENT_API_KEY", "apiKey", "airtel-device-agent-dev-key"))
    asset_tag = str(get_setting(args.asset_tag, config, "DEVICE_AGENT_ASSET_TAG", "assetTag", "")).strip()
    interval = int(get_setting(args.interval, config, "DEVICE_AGENT_INTERVAL", "interval", 300))

    if not asset_tag:
        print("An asset tag is required. Provide --asset-tag, DEVICE_AGENT_ASSET_TAG, or agent-config.json.", file=sys.stderr)
        return 1

    hostname = get_hostname()
    operating_system = get_operating_system()
    device_uuid = build_device_uuid(asset_tag)
    history = {
        "cpu": deque(maxlen=12),
        "ram": deque(maxlen=12),
    }
    failure_count = 0

    register_payload = {
        "assetTag": asset_tag,
        "deviceUuid": device_uuid,
        "hostname": hostname,
        "operatingSystem": operating_system,
        "agentVersion": AGENT_VERSION,
    }

    try:
        register_response = post_json(f"{api_url}/api/device-agent/register", register_payload, api_key)
        print(f"Registered device agent for {register_response['agent']['assetTag']} on {hostname}.")
    except error.HTTPError as exc:
        print(f"Registration failed: {exc.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Registration failed: {exc}", file=sys.stderr)
        return 1

    while True:
        metrics = collect_metrics(api_url, history, failure_count)
        payload = {
            **register_payload,
            "metrics": metrics,
        }

        try:
            response = post_json(f"{api_url}/api/device-agent/metrics", payload, api_key)
            recommendation = response.get("recommendation", {})
            print(
                f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] "
                f"health={response.get('deviceHealth')} "
                f"alerts={response.get('alertsCreated')} "
                f"recommendation={recommendation.get('recommendation')}"
            )

            latest = get_json(
                f"{api_url}/api/device-agent/recommendation?assetTag={parse.quote(asset_tag)}",
                api_key,
            )
            if latest.get("recommendation"):
                print(
                    f"Latest recommendation: {latest['recommendation']} "
                    f"(confidence={latest.get('confidenceScore')}, model={latest.get('modelVersion')})"
                )
            failure_count = 0
        except error.HTTPError as exc:
            failure_count += 1
            print(f"Telemetry upload failed: {exc.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        except Exception as exc:
            failure_count += 1
            print(f"Telemetry upload failed: {exc}", file=sys.stderr)

        if args.once:
            return 0 if failure_count == 0 else 1

        time.sleep(max(interval, 30))


if __name__ == "__main__":
    raise SystemExit(main())
