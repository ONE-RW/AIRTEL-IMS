from __future__ import annotations

import argparse
import ctypes
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any
from urllib import error, parse, request

import psutil
from PIL import Image, ImageDraw
import pystray


AGENT_VERSION = "1.0.0"
DEFAULT_WINDOWS_INSTALL_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "AirtelIMSDeviceAgent"
DEFAULT_WINDOWS_TASK_NAME = "Airtel IMS Device Agent"
MIN_TELEMETRY_INTERVAL_SECONDS = 10
DEFAULT_LOG_FILE_NAME = "agent.log"


def get_runtime_base_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


DEFAULT_CONFIG_PATH = get_runtime_base_directory() / "agent-config.json"
DEFAULT_LOG_PATH = get_runtime_base_directory() / DEFAULT_LOG_FILE_NAME


class TrayController:
    def __init__(self, log_path: Path) -> None:
        self.log_path = log_path
        self._icon: pystray.Icon | None = None
        self._thread: threading.Thread | None = None
        self.stop_requested = False
        self.is_available = is_windows() and is_frozen_executable()

    def _create_image(self) -> Image.Image:
        image = Image.new("RGB", (64, 64), color=(245, 248, 250))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((6, 6, 58, 58), radius=12, fill=(229, 69, 56))
        draw.rectangle((16, 18, 48, 46), fill=(255, 255, 255))
        draw.rectangle((26, 48, 38, 52), fill=(255, 255, 255))
        return image

    def _open_log(self, icon: pystray.Icon | None = None, item: Any = None) -> None:
        try:
            os.startfile(str(self.log_path))
        except Exception:
            pass

    def _exit_agent(self, icon: pystray.Icon | None = None, item: Any = None) -> None:
        self.stop_requested = True
        self.notify("Airtel IMS Agent", "Stopping the background agent.")
        if self._icon:
            self._icon.stop()

    def start(self) -> None:
        if not self.is_available or self._thread:
            return

        menu = pystray.Menu(
            pystray.MenuItem("Open Log", self._open_log),
            pystray.MenuItem("Exit Agent", self._exit_agent),
        )
        self._icon = pystray.Icon("AirtelIMSDeviceAgent", self._create_image(), "Airtel IMS Device Agent", menu)
        self._thread = threading.Thread(target=self._icon.run, daemon=True)
        self._thread.start()

    def notify(self, title: str, message: str) -> None:
        if not self.is_available:
            return
        if not self._icon:
            self.start()
            time.sleep(0.2)
        try:
            if self._icon:
                self._icon.notify(message, title)
        except Exception:
            pass

    def stop(self) -> None:
        if self._icon:
            try:
                self._icon.stop()
            except Exception:
                pass


class NullTrayController:
    stop_requested = False

    def start(self) -> None:
        return

    def notify(self, title: str, message: str) -> None:
        return

    def stop(self) -> None:
        return


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_log_path(config: dict[str, Any]) -> Path:
    configured_path = str(config.get("logFile") or os.getenv("DEVICE_AGENT_LOG_FILE") or "").strip()
    if configured_path:
        return Path(configured_path).expanduser()
    return DEFAULT_LOG_PATH


def log_message(message: str, *, is_error: bool = False, log_path: Path | None = None) -> None:
    stream = sys.stderr if is_error else sys.stdout
    print(message, file=stream)
    target_path = log_path or DEFAULT_LOG_PATH
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with target_path.open("a", encoding="utf-8") as handle:
            handle.write(f"{message}\n")
    except Exception:
        pass


def show_windows_error_dialog(title: str, message: str) -> None:
    if not is_windows():
        return
    try:
        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
    except Exception:
        pass


def get_setting(cli_value: Any, config: dict[str, Any], env_key: str, config_key: str, default: Any = None) -> Any:
    if cli_value not in (None, ""):
        return cli_value
    if os.getenv(env_key) not in (None, ""):
        return os.getenv(env_key)
    if config.get(config_key) not in (None, ""):
        return config.get(config_key)
    return default


def get_bool_setting(cli_value: bool, config: dict[str, Any], env_key: str, config_key: str, default: bool = False) -> bool:
    if cli_value:
        return True

    env_value = os.getenv(env_key)
    if env_value not in (None, ""):
        return str(env_value).strip().lower() in {"1", "true", "yes", "on"}

    config_value = config.get(config_key)
    if isinstance(config_value, bool):
        return config_value
    if config_value not in (None, ""):
        return str(config_value).strip().lower() in {"1", "true", "yes", "on"}

    return default


def is_windows() -> bool:
    return os.name == "nt"


def is_frozen_executable() -> bool:
    return bool(getattr(sys, "frozen", False))


def is_windows_admin() -> bool:
    if not is_windows():
        return False

    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def build_device_uuid(asset_tag: str) -> str:
    machine_node = hex(uuid.getnode())
    namespace_seed = f"{platform.node()}::{machine_node}::{asset_tag}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, namespace_seed))


def get_hostname() -> str:
    return platform.node() or socket.gethostname() or "unknown-host"


def resolve_configured_hostname(cli_hostname: Any, config: dict[str, Any]) -> str:
    # FIX: guard against None before calling str(), then strip
    raw = get_setting(cli_hostname, config, "DEVICE_AGENT_HOSTNAME", "hostname", "")
    return str(raw).strip() if raw is not None else ""


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
        sensors = {}

    for entries in sensors.values():
        for entry in entries:
            current = getattr(entry, "current", None)
            if current is not None:
                try:
                    value = float(current)
                except (TypeError, ValueError):
                    continue
                if 0 < value <= 120:
                    return value

    if is_windows():
        windows_temperature = read_windows_temperature()
        if windows_temperature is not None:
            return windows_temperature

    return None


def run_powershell_temperature(command: str, timeout: float = 8.0) -> float | None:
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-Command",
                command,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    for line in (result.stdout or "").splitlines():
        value = line.strip()
        if not value:
            continue
        try:
            numeric = float(value)
        except ValueError:
            continue
        if 0 < numeric <= 120:
            return numeric

    return None


def read_windows_temperature() -> float | None:
    # Best effort 1: use LibreHardwareMonitor/OpenHardwareMonitor WMI if present.
    monitor_queries = [
        (
            "root\\LibreHardwareMonitor",
            "Get-CimInstance -Namespace 'root\\LibreHardwareMonitor' -ClassName Sensor | "
            "Where-Object { $_.SensorType -eq 'Temperature' -and $_.Value -gt 0 } | "
            "Sort-Object Value -Descending | Select-Object -First 1 -ExpandProperty Value"
        ),
        (
            "root\\OpenHardwareMonitor",
            "Get-WmiObject -Namespace 'root\\OpenHardwareMonitor' -Class Sensor | "
            "Where-Object { $_.SensorType -eq 'Temperature' -and $_.Value -gt 0 } | "
            "Sort-Object Value -Descending | Select-Object -First 1 -ExpandProperty Value"
        ),
    ]

    for _namespace, query in monitor_queries:
        value = run_powershell_temperature(query)
        if value is not None:
            return value

    # Best effort 2: ACPI thermal zone. This is less reliable, but available on some machines.
    acpi_query = (
        "Get-CimInstance -Namespace 'root/wmi' -ClassName MSAcpi_ThermalZoneTemperature | "
        "ForEach-Object { ($_.CurrentTemperature / 10) - 273.15 } | "
        "Where-Object { $_ -gt 0 -and $_ -le 120 } | "
        "Select-Object -First 1"
    )
    return run_powershell_temperature(acpi_query)


def estimate_battery_health(battery: Any) -> float | None:
    """
    FIX: battery_health was previously a copy of battery.percent (the charge level),
    which is wrong — charge level and battery health are different things.
    psutil does not expose raw battery wear data, so we return None to signal
    that health is unavailable rather than silently reporting a misleading number.
    On Windows, a WMI call to BatteryFullChargedCapacity vs DesignedCapacity would
    give the real figure; that is left as a platform-specific extension point.
    """
    if battery is None:
        return None
    return None  # genuinely unavailable via psutil; do not substitute charge %


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

    # FIX: battery_level is the current charge percentage (e.g. 82 %)
    battery_level = float(battery.percent) if battery else None
    # FIX: battery_health is a separate concept; psutil cannot provide it reliably
    battery_health = estimate_battery_health(battery)
    disk_health = max(0.0, 100.0 - float(disk.percent))
    workload_intensity = (sum(history["cpu"]) / len(history["cpu"]) + sum(history["ram"]) / len(history["ram"])) / 2

    return {
        "cpuUsage": round(cpu_usage, 2),
        "ramUsage": round(float(memory.percent), 2),
        "diskUsage": round(float(disk.percent), 2),
        "diskHealth": round(disk_health, 2),
        # battery_health intentionally None when unavailable — do not replace with charge %
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
    parser.add_argument("--hostname", help="Hostname to match against IMS when hostname mode is enabled.")
    parser.add_argument("--use-hostname", action="store_true", help="Use the device hostname instead of an asset tag.")
    parser.add_argument("--interval", type=int, help="Telemetry push interval in seconds.")
    parser.add_argument("--once", action="store_true", help="Send one telemetry payload and exit.")
    parser.add_argument("--install", action="store_true", help="Install the agent for automatic startup on Windows.")
    parser.add_argument("--background", action="store_true", help="Run as a detached background process.")
    parser.add_argument("--foreground", action="store_true", help="Keep the current console attached.")
    parser.add_argument("--install-dir", default=str(DEFAULT_WINDOWS_INSTALL_DIR), help="Installation directory for --install.")
    parser.add_argument("--task-name", default=DEFAULT_WINDOWS_TASK_NAME, help="Scheduled task name for --install.")
    return parser.parse_args()


def normalize_asset_tag(value: Any) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""

    if normalized.lower().endswith(".json"):
        normalized = normalized[:-5].strip()

    if normalized.lower().startswith("agent-config-"):
        normalized = normalized[len("agent-config-"):].strip()

    return normalized


def resolve_lookup_mode(cli_use_hostname: bool, cli_asset_tag: Any, config: dict[str, Any]) -> bool:
    # FIX: if an explicit asset tag is supplied on the CLI, always use asset-tag mode
    # regardless of any --use-hostname flag or config setting.
    if normalize_asset_tag(cli_asset_tag):
        return False
    return get_bool_setting(cli_use_hostname, config, "DEVICE_AGENT_USE_HOSTNAME", "useHostnameAsIdentifier", False)


def ensure_install_settings(
    args: argparse.Namespace,
    config: dict[str, Any],
) -> tuple[str, str, str, str, int]:
    api_url = str(get_setting(args.api_url, config, "DEVICE_AGENT_API_URL", "apiUrl", "http://127.0.0.1:4000")).rstrip("/")
    api_key = str(get_setting(args.api_key, config, "DEVICE_AGENT_API_KEY", "apiKey", "airtel-device-agent-dev-key")).strip()
    asset_tag = normalize_asset_tag(get_setting(args.asset_tag, config, "DEVICE_AGENT_ASSET_TAG", "assetTag", ""))
    use_hostname = resolve_lookup_mode(args.use_hostname, args.asset_tag, config)
    configured_hostname = resolve_configured_hostname(args.hostname, config)
    # FIX: clamp interval to the minimum allowed value at resolution time
    raw_interval = get_setting(args.interval, config, "DEVICE_AGENT_INTERVAL", "interval", MIN_TELEMETRY_INTERVAL_SECONDS)
    interval = max(int(raw_interval), MIN_TELEMETRY_INTERVAL_SECONDS)

    if not api_url:
        raise ValueError("An API URL is required for installation.")
    if not api_key:
        raise ValueError("An API key is required for installation.")
    if not asset_tag and not use_hostname:
        raise ValueError("An asset tag is required unless --use-hostname is enabled.")
    if use_hostname and not configured_hostname:
        raise ValueError("A hostname is required when hostname matching is enabled.")

    return api_url, api_key, asset_tag, configured_hostname, interval


def copy_runtime_files(install_dir: Path) -> tuple[str, str | None]:
    install_dir.mkdir(parents=True, exist_ok=True)

    if is_frozen_executable():
        source_executable = Path(sys.executable).resolve()
        target_executable = install_dir / source_executable.name
        shutil.copy2(source_executable, target_executable)
        return str(target_executable), None

    source_script = Path(__file__).resolve()
    target_script = install_dir / source_script.name
    shutil.copy2(source_script, target_script)

    requirements_source = source_script.parent / "requirements.txt"
    if requirements_source.exists():
        shutil.copy2(requirements_source, install_dir / "requirements.txt")

    return sys.executable, f'"{target_script}"'


def write_install_config(config_path: Path, api_url: str, api_key: str, asset_tag: str, hostname: str, interval: int, use_hostname: bool) -> None:
    config_payload: dict[str, Any] = {
        "apiUrl": api_url,
        "apiKey": api_key,
        "interval": max(interval, MIN_TELEMETRY_INTERVAL_SECONDS),
        "logFile": str(config_path.with_name(DEFAULT_LOG_FILE_NAME)),
    }
    if asset_tag:
        config_payload["assetTag"] = asset_tag
    if use_hostname:
        config_payload["useHostnameAsIdentifier"] = True
        config_payload["hostname"] = hostname
    config_path.write_text(json.dumps(config_payload, indent=2), encoding="utf-8")


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def register_windows_startup_task(task_name: str, execute: str, arguments: str | None) -> None:
    action_line = f"$action = New-ScheduledTaskAction -Execute {ps_quote(execute)}"
    if arguments:
        action_line += f" -Argument {ps_quote(arguments)}"

    powershell_command = f"""
{action_line}
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName {ps_quote(task_name)} -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Uploads workstation health telemetry to Airtel IMS." -Force | Out-Null
"""
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            powershell_command,
        ],
        check=True,
    )


def install_agent(args: argparse.Namespace, config: dict[str, Any]) -> int:
    if not is_windows():
        print("Windows installation is the only supported automatic startup mode.", file=sys.stderr)
        return 1

    if not is_windows_admin():
        print("Administrator privileges are required to install the Windows startup task.", file=sys.stderr)
        return 1

    try:
        api_url, api_key, asset_tag, configured_hostname, interval = ensure_install_settings(args, config)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    install_dir = Path(args.install_dir).expanduser().resolve()
    execute, arguments = copy_runtime_files(install_dir)
    use_hostname = resolve_lookup_mode(args.use_hostname, args.asset_tag, config)
    write_install_config(install_dir / "agent-config.json", api_url, api_key, asset_tag, configured_hostname, interval, use_hostname)

    try:
        register_windows_startup_task(args.task_name, execute, arguments)
    except subprocess.CalledProcessError as exc:
        print(f"Scheduled task registration failed: {exc}", file=sys.stderr)
        return 1

    print(f"Agent installed to {install_dir}")
    print(f"Startup task '{args.task_name}' is registered for Windows boot.")
    print("You can test immediately with:")
    if is_frozen_executable():
        print(f'  "{install_dir / Path(sys.executable).name}" --once')
    else:
        print(f'  "{sys.executable}" "{install_dir / "agent.py"}" --once')
    return 0


def should_detach_to_background(args: argparse.Namespace) -> bool:
    return (
        is_windows()
        and is_frozen_executable()
        and not args.install
        and not args.once
        and not args.background
        and not args.foreground
    )


def relaunch_in_background(args: argparse.Namespace, log_path: Path) -> int:
    creation_flags = 0
    creation_flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    creation_flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
    creation_flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)

    child_args = [str(Path(sys.executable).resolve()), "--background", "--config", str(Path(args.config).resolve())]

    for option_name in ("api_url", "api_key", "asset_tag", "hostname", "install_dir", "task_name"):
        option_value = getattr(args, option_name, None)
        if option_value not in (None, ""):
            child_args.extend([f"--{option_name.replace('_', '-')}", str(option_value)])

    if args.interval is not None:
        child_args.extend(["--interval", str(args.interval)])
    if args.use_hostname:
        child_args.append("--use-hostname")

    subprocess.Popen(
        child_args,
        close_fds=True,
        creationflags=creation_flags,
        cwd=str(get_runtime_base_directory()),
    )
    log_message(
        f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Agent detached to background. Logs: {log_path}",
        log_path=log_path,
    )
    return 0


def main() -> int:
    args = parse_args()
    config = load_config(Path(args.config))
    log_path = get_log_path(config)
    tray: TrayController | NullTrayController = NullTrayController()

    if args.install:
        return install_agent(args, config)

    if should_detach_to_background(args):
        return relaunch_in_background(args, log_path)

    if args.background:
        tray = TrayController(log_path)
        tray.start()
        tray.notify("Airtel IMS Agent", f"Background monitoring started. Logs: {log_path}")

    api_url = str(get_setting(args.api_url, config, "DEVICE_AGENT_API_URL", "apiUrl", "http://127.0.0.1:4000")).rstrip("/")
    api_key = str(get_setting(args.api_key, config, "DEVICE_AGENT_API_KEY", "apiKey", "airtel-device-agent-dev-key"))
    asset_tag = normalize_asset_tag(get_setting(args.asset_tag, config, "DEVICE_AGENT_ASSET_TAG", "assetTag", ""))
    use_hostname = resolve_lookup_mode(args.use_hostname, args.asset_tag, config)
    configured_hostname = resolve_configured_hostname(args.hostname, config)
    # FIX: enforce minimum interval in the main path, not just during install
    raw_interval = get_setting(args.interval, config, "DEVICE_AGENT_INTERVAL", "interval", MIN_TELEMETRY_INTERVAL_SECONDS)
    interval = max(int(raw_interval), MIN_TELEMETRY_INTERVAL_SECONDS)
    runtime_hostname = get_hostname()
    hostname = configured_hostname or runtime_hostname
    device_identifier = hostname if use_hostname else asset_tag

    if not device_identifier:
        message = "An asset tag is required unless hostname mode is enabled. Provide --asset-tag or set useHostnameAsIdentifier with a hostname."
        log_message(message, is_error=True, log_path=log_path)
        if args.background or is_frozen_executable():
            show_windows_error_dialog("Airtel IMS Agent Configuration Error", message)
            tray.notify("Airtel IMS Agent", message)
        return 1

    operating_system = get_operating_system()
    device_uuid = build_device_uuid(device_identifier)
    history: dict[str, deque[float]] = {
        "cpu": deque(maxlen=12),
        "ram": deque(maxlen=12),
    }
    failure_count = 0

    register_payload: dict[str, Any] = {
        "assetTag": asset_tag or None,
        "deviceUuid": device_uuid,
        "hostname": hostname,
        "operatingSystem": operating_system,
        "agentVersion": AGENT_VERSION,
        "lookupMode": "hostname" if use_hostname else "assetTag",
    }

    while True:
        try:
            register_response = post_json(f"{api_url}/api/device-agent/register", register_payload, api_key)
            log_message(
                f"Registered device agent for {register_response['agent']['assetTag']} on {hostname}.",
                log_path=log_path,
            )
            break
        except error.HTTPError as exc:
            message = f"Registration failed: {exc.read().decode('utf-8', errors='ignore')}"
        except Exception as exc:
            message = f"Registration failed: {exc}"

        if args.once:
            log_message(message, is_error=True, log_path=log_path)
            return 1

        log_message(
            f"{message}. Retrying in {interval} seconds.",
            is_error=True,
            log_path=log_path,
        )
        tray.notify("Airtel IMS Agent", f"Unable to register with IMS. Retrying in {interval} seconds.")
        time.sleep(interval)

    while True:
        if tray.stop_requested:
            log_message("Background agent stop requested from tray icon.", log_path=log_path)
            tray.stop()
            return 0

        metrics = collect_metrics(api_url, history, failure_count)
        payload: dict[str, Any] = {
            **register_payload,
            "metrics": metrics,
        }

        try:
            response = post_json(f"{api_url}/api/device-agent/metrics", payload, api_key)
            recommendation = response.get("recommendation", {})
            log_message(
                f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] "
                f"health={response.get('deviceHealth')} "
                f"alerts={response.get('alertsCreated')} "
                f"recommendation={recommendation.get('recommendation')}",
                log_path=log_path,
            )

            latest = get_json(
                f"{api_url}/api/device-agent/recommendation?lookupMode={'hostname' if use_hostname else 'assetTag'}&"
                f"{'hostname' if use_hostname else 'assetTag'}={parse.quote(hostname if use_hostname else asset_tag)}",
                api_key,
            )
            if latest.get("recommendation"):
                log_message(
                    f"Latest recommendation: {latest['recommendation']} "
                    f"(confidence={latest.get('confidenceScore')}, model={latest.get('modelVersion')})",
                    log_path=log_path,
                )
            failure_count = 0
        except error.HTTPError as exc:
            failure_count += 1
            failure_message = f"Telemetry upload failed: {exc.read().decode('utf-8', errors='ignore')}"
            log_message(failure_message, is_error=True, log_path=log_path)
            if failure_count in {1, 3, 6}:
                tray.notify("Airtel IMS Agent", "Telemetry upload failed. Check your network, server URL, or API key.")
        except Exception as exc:
            failure_count += 1
            log_message(f"Telemetry upload failed: {exc}", is_error=True, log_path=log_path)
            if failure_count in {1, 3, 6}:
                tray.notify("Airtel IMS Agent", "Telemetry upload failed. The agent will keep retrying in the background.")

        if args.once:
            tray.stop()
            return 0 if failure_count == 0 else 1

        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
