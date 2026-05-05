from __future__ import annotations

import ctypes
import os
import platform
import socket
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk


APP_TITLE = "Airtel IMS Device Agent Setup"
DEFAULT_INSTALL_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "AirtelIMSDeviceAgent"
EMBEDDED_AGENT_NAME = "AirtelIMSDeviceAgent.exe"
MIN_TELEMETRY_INTERVAL_SECONDS = 10


# ---------------------------------------------------------------------------
# Device identity helpers
# ---------------------------------------------------------------------------

def detect_asset_tag() -> str:
    """
    Try to read the hardware asset tag written to the BIOS/UEFI chassis by IT.
    Falls back through several WMI classes so it works on most OEM hardware.
    Returns an empty string when nothing useful is found.
    """
    wmi_queries = [
        # Most reliable — chassis / enclosure asset tag set by IT
        ("Win32_SystemEnclosure", "SMBIOSAssetTag"),
        # BIOS serial number — often used as asset tag when chassis tag is blank
        ("Win32_BIOS", "SerialNumber"),
        # System-level serial (laptops / desktops)
        ("Win32_ComputerSystemProduct", "IdentifyingNumber"),
    ]

    _placeholder_values = {
        "", "none", "null", "n/a", "na", "not available",
        "to be filled by o.e.m.", "to be filled by oem",
        "default string", "0", "00000000", "unknown",
    }

    for wmi_class, field in wmi_queries:
        try:
            ps_result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy", "Bypass",
                    "-Command",
                    f"(Get-WmiObject -Class {wmi_class}).{field}",
                ],
                capture_output=True,
                text=True,
                timeout=8,
            )
            value = (ps_result.stdout or "").strip()
            if value.lower() not in _placeholder_values:
                return value
        except Exception:
            continue

    return ""


def detect_hostname() -> str:
    """Return the machine's network hostname."""
    return platform.node() or socket.gethostname() or ""


# ---------------------------------------------------------------------------
# Path / quoting helpers
# ---------------------------------------------------------------------------

def get_embedded_agent_path() -> Path:
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).resolve().parent
        bundled = base_dir / EMBEDDED_AGENT_NAME
        if bundled.exists():
            return bundled
        meipass = Path(getattr(sys, "_MEIPASS", str(base_dir)))
        return meipass / EMBEDDED_AGENT_NAME

    script_dir = Path(__file__).resolve().parent
    beside = script_dir / EMBEDDED_AGENT_NAME
    if beside.exists():
        return beside
    return script_dir / "dist" / EMBEDDED_AGENT_NAME


def ps_quote(value: str) -> str:
    """Single-quote a value for safe PowerShell / cmd passing."""
    return "'" + str(value).replace("'", "''") + "'"


def build_install_command(
    agent_path: Path,
    api_url: str,
    api_key: str,
    install_dir: str,
    interval: int,
    use_hostname: bool,
    asset_tag: str,
    hostname: str,
) -> list[str]:
    command = [
        str(agent_path),
        "--install",
        "--api-url",    api_url.strip(),
        "--api-key",    api_key.strip(),
        "--install-dir", install_dir.strip(),
        "--interval",   str(max(interval, MIN_TELEMETRY_INTERVAL_SECONDS)),
    ]
    if use_hostname:
        command.extend(["--use-hostname", "--hostname", hostname.strip()])
    else:
        command.extend(["--asset-tag", asset_tag.strip()])
    return command


def is_windows() -> bool:
    return os.name == "nt"


def is_windows_admin() -> bool:
    if not is_windows():
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------

class InstallerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.resizable(False, False)
        self.root.configure(padx=20, pady=20)

        # Detect device identity before building UI
        detected_asset_tag = detect_asset_tag()
        detected_hostname  = detect_hostname()

        self.api_url_var      = tk.StringVar(value="http://localhost:4000")
        self.api_key_var      = tk.StringVar(value="airtel-device-agent-dev-key")
        self.asset_tag_var    = tk.StringVar(value=detected_asset_tag)
        self.hostname_var     = tk.StringVar(value=detected_hostname)
        self.install_dir_var  = tk.StringVar(value=str(DEFAULT_INSTALL_DIR))
        self.interval_var     = tk.StringVar(value="30")
        self.use_hostname_var = tk.BooleanVar(value=False)

        status_text = (
            "Device identity detected — verify and click Install."
            if detected_asset_tag or detected_hostname
            else "Could not auto-detect device identity — enter manually."
        )
        self.status_var = tk.StringVar(value=status_text)

        self._build_ui(detected_asset_tag, detected_hostname)
        self._toggle_identifier_mode()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self, detected_asset_tag: str, detected_hostname: str) -> None:
        r = 0  # current grid row counter

        # Title
        ttk.Label(
            self.root,
            text="Airtel IMS Device Agent Installer",
            font=("Segoe UI", 14, "bold"),
        ).grid(row=r, column=0, columnspan=2, sticky="w", pady=(0, 4)); r += 1

        ttk.Label(
            self.root,
            text="Sets up the monitoring agent to start automatically when Windows boots.",
            wraplength=520,
            foreground="#555555",
        ).grid(row=r, column=0, columnspan=2, sticky="w", pady=(0, 14)); r += 1

        # ── Detection banner ───────────────────────────────────────────
        banner = tk.Frame(self.root, bg="#e8f4fd", padx=10, pady=8)
        banner.grid(row=r, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        banner.columnconfigure(0, weight=1)

        ttk.Label(
            banner,
            text="Detected device identity",
            font=("Segoe UI", 9, "bold"),
            background="#e8f4fd",
        ).grid(row=0, column=0, sticky="w")

        ttk.Label(
            banner,
            text=f"  Asset tag / serial :  {detected_asset_tag or 'Not found — enter manually below'}",
            background="#e8f4fd",
            foreground="#2e7d32" if detected_asset_tag else "#b71c1c",
        ).grid(row=1, column=0, sticky="w")

        ttk.Label(
            banner,
            text=f"  Hostname           :  {detected_hostname or 'Not found'}",
            background="#e8f4fd",
            foreground="#2e7d32" if detected_hostname else "#b71c1c",
        ).grid(row=2, column=0, sticky="w")
        r += 1

        # ── Server fields ───────────────────────────────────────────────
        self._field("IMS server URL", self.api_url_var, r); r += 1
        self._field("Agent API key",  self.api_key_var,  r, show="*"); r += 1

        # ── Identifier mode toggle ──────────────────────────────────────
        ttk.Checkbutton(
            self.root,
            text="Use hostname for matching instead of asset tag",
            variable=self.use_hostname_var,
            command=self._toggle_identifier_mode,
        ).grid(row=r, column=0, columnspan=2, sticky="w", pady=(6, 2)); r += 1

        # ── Asset tag row ───────────────────────────────────────────────
        self.asset_tag_label = ttk.Label(self.root, text="Asset tag")
        self.asset_tag_label.grid(row=r, column=0, sticky="w", pady=5)

        at_frame = ttk.Frame(self.root)
        at_frame.grid(row=r, column=1, sticky="ew", pady=5)
        at_frame.columnconfigure(0, weight=1)

        self.asset_tag_entry = ttk.Entry(at_frame, textvariable=self.asset_tag_var)
        self.asset_tag_entry.grid(row=0, column=0, sticky="ew")

        self.asset_tag_badge = ttk.Label(
            at_frame,
            text="✓ auto-detected" if detected_asset_tag else "⚠ enter manually",
            foreground="#2e7d32" if detected_asset_tag else "#b71c1c",
            font=("Segoe UI", 8),
        )
        self.asset_tag_badge.grid(row=1, column=0, sticky="w")
        r += 1

        # ── Hostname row ────────────────────────────────────────────────
        self.hostname_label = ttk.Label(self.root, text="IMS hostname match")
        self.hostname_label.grid(row=r, column=0, sticky="w", pady=5)

        hn_frame = ttk.Frame(self.root)
        hn_frame.grid(row=r, column=1, sticky="ew", pady=5)
        hn_frame.columnconfigure(0, weight=1)

        self.hostname_entry = ttk.Entry(hn_frame, textvariable=self.hostname_var)
        self.hostname_entry.grid(row=0, column=0, sticky="ew")

        self.hostname_badge = ttk.Label(
            hn_frame,
            text="✓ auto-detected" if detected_hostname else "⚠ enter manually",
            foreground="#2e7d32" if detected_hostname else "#b71c1c",
            font=("Segoe UI", 8),
        )
        self.hostname_badge.grid(row=1, column=0, sticky="w")
        r += 1

        # ── Install folder + interval ───────────────────────────────────
        self._field("Install folder",               self.install_dir_var, r); r += 1
        self._field("Telemetry interval (seconds)", self.interval_var,   r); r += 1

        # ── Hint ────────────────────────────────────────────────────────
        ttk.Label(
            self.root,
            text=(
                "Asset-tag mode matches this device to its IMS record by hardware tag / serial.\n"
                "Hostname mode matches by the computer name registered in IMS."
            ),
            wraplength=520,
            foreground="#777777",
            font=("Segoe UI", 8),
        ).grid(row=r, column=0, columnspan=2, sticky="w", pady=(4, 12)); r += 1

        # ── Buttons ─────────────────────────────────────────────────────
        btn_frame = ttk.Frame(self.root)
        btn_frame.grid(row=r, column=0, columnspan=2, sticky="e"); r += 1
        ttk.Button(btn_frame, text="Install Agent", command=self.install_agent).pack(side="left", padx=(0, 6))
        ttk.Button(btn_frame, text="Close",         command=self.root.destroy).pack(side="left")

        # ── Status ──────────────────────────────────────────────────────
        ttk.Label(
            self.root,
            textvariable=self.status_var,
            wraplength=520,
            foreground="#004b87",
        ).grid(row=r, column=0, columnspan=2, sticky="w", pady=(12, 0))

        self.root.columnconfigure(1, weight=1)

    def _field(self, label: str, var: tk.StringVar, row: int, show: str | None = None) -> None:
        ttk.Label(self.root, text=label).grid(row=row, column=0, sticky="w", pady=5)
        ttk.Entry(self.root, textvariable=var, width=46, show=show).grid(
            row=row, column=1, sticky="ew", pady=5,
        )

    # ------------------------------------------------------------------
    # Toggle logic
    # ------------------------------------------------------------------

    def _toggle_identifier_mode(self) -> None:
        use_hostname = self.use_hostname_var.get()
        has_tag  = bool(self.asset_tag_var.get().strip())
        has_host = bool(self.hostname_var.get().strip())

        if use_hostname:
            self.asset_tag_entry.state(["disabled"])
            self.hostname_entry.state(["!disabled"])
            self.asset_tag_label.configure(foreground="#aaaaaa")
            self.hostname_label.configure(foreground="#000000")
            self.asset_tag_badge.configure(foreground="#cccccc")
            self.hostname_badge.configure(foreground="#2e7d32" if has_host else "#b71c1c")
        else:
            self.asset_tag_entry.state(["!disabled"])
            self.hostname_entry.state(["disabled"])
            self.asset_tag_label.configure(foreground="#000000")
            self.hostname_label.configure(foreground="#aaaaaa")
            self.hostname_badge.configure(foreground="#cccccc")
            self.asset_tag_badge.configure(foreground="#2e7d32" if has_tag else "#b71c1c")

    # ------------------------------------------------------------------
    # Install action
    # ------------------------------------------------------------------

    def install_agent(self) -> None:
        agent_path = get_embedded_agent_path()
        if not agent_path.exists():
            messagebox.showerror(
                APP_TITLE,
                f"The embedded monitoring agent was not found.\n\nExpected path:\n{agent_path}",
            )
            return

        api_url      = self.api_url_var.get().strip()
        api_key      = self.api_key_var.get().strip()
        install_dir  = self.install_dir_var.get().strip()
        use_hostname = self.use_hostname_var.get()
        asset_tag    = self.asset_tag_var.get().strip()
        hostname     = self.hostname_var.get().strip()

        try:
            interval = int(self.interval_var.get().strip() or str(MIN_TELEMETRY_INTERVAL_SECONDS))
        except ValueError:
            messagebox.showerror(APP_TITLE, "Telemetry interval must be a whole number.")
            return

        if not api_url or not api_key or not install_dir:
            messagebox.showerror(APP_TITLE, "IMS server URL, API key, and install folder are all required.")
            return

        if use_hostname and not hostname:
            messagebox.showerror(APP_TITLE, "Enter the hostname as it appears in IMS when hostname mode is enabled.")
            return

        if not use_hostname and not asset_tag:
            messagebox.showerror(APP_TITLE, "Asset tag is required when hostname mode is disabled.")
            return

        command = build_install_command(
            agent_path, api_url, api_key, install_dir,
            interval, use_hostname, asset_tag, hostname,
        )
        self.status_var.set("Launching installer…")
        self.root.update_idletasks()

        try:
            if is_windows_admin():
                completed = subprocess.run(command, check=False, text=True, capture_output=True)
                if completed.returncode == 0:
                    self.status_var.set("Installation completed successfully.")
                    messagebox.showinfo(
                        APP_TITLE,
                        "The agent has been installed and will start automatically on next Windows boot.\n\n"
                        f"Asset tag : {asset_tag or '(hostname mode)'}\n"
                        f"Hostname  : {hostname}\n"
                        f"Server    : {api_url}",
                    )
                    return
                details = (completed.stderr or completed.stdout or "Unknown error from installer.").strip()
                self.status_var.set("Installation failed.")
                messagebox.showerror(APP_TITLE, details)
                return

            if not is_windows():
                messagebox.showerror(APP_TITLE, "Automatic installation is only supported on Windows.")
                return

            command_line = " ".join(ps_quote(part) for part in command)
            result = ctypes.windll.shell32.ShellExecuteW(
                None, "runas", "cmd.exe", f"/c {command_line}", None, 1
            )
            if result <= 32:
                raise OSError("The Windows elevation prompt was cancelled or failed to start.")

            self.status_var.set("Installer launched with Administrator privileges — follow the Windows prompts.")
            messagebox.showinfo(
                APP_TITLE,
                "The installer was launched with Administrator privileges.\n"
                "Complete the Windows prompt to finish setup.",
            )
        except Exception as exc:
            self.status_var.set("Unable to launch installer.")
            messagebox.showerror(APP_TITLE, str(exc))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    InstallerApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())