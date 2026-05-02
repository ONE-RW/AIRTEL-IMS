import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const managedPorts = [4000, 5173];

const processes = [];
let shuttingDown = false;

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").toLowerCase();
}

function parseJsonOutput(command, args) {
  const output = execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  if (!output) {
    return [];
  }

  return JSON.parse(output);
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value == null) {
    return [];
  }

  return [value];
}

function collectProjectNodeProcessIdsOnWindows() {
  const portsCsv = managedPorts.join(",");
  const script = `
    $ports = @(${portsCsv});
    $connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $ports -contains $_.LocalPort } |
      Select-Object -ExpandProperty OwningProcess -Unique;
    $projectRoot = "${projectRoot.replaceAll("\\", "\\\\")}";
    $items = @();
    foreach ($procId in $connections) {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue;
      if ($null -eq $proc) { continue }
      $commandLine = [string]$proc.CommandLine;
      $normalized = $commandLine.ToLowerInvariant();
      if ($normalized.Contains("server.js") -or $normalized.Contains("vite.js") -or $normalized.Contains($projectRoot.ToLowerInvariant())) {
        $items += [pscustomobject]@{
          pid = [int]$procId
          commandLine = $commandLine
        };
      }
    }
    $items | ConvertTo-Json -Compress
  `;

  try {
    return ensureArray(parseJsonOutput("powershell", ["-NoProfile", "-Command", script]));
  } catch {
    return [];
  }
}

function collectProjectNodeProcessIdsOnUnix() {
  const processIds = new Set();

  for (const port of managedPorts) {
    try {
      const output = execFileSync("lsof", ["-ti", `tcp:${port}`], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();

      for (const line of output.split(/\r?\n/)) {
        const pid = Number.parseInt(line.trim(), 10);
        if (Number.isInteger(pid) && pid > 0) {
          processIds.add(pid);
        }
      }
    } catch {
      // Ignore missing lsof output for a port.
    }
  }

  const items = [];

  for (const procId of processIds) {
    try {
      const commandLine = execFileSync("ps", ["-p", String(procId), "-o", "command="], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const normalized = normalizePath(commandLine);

      if (
        normalized.includes("server.js") ||
        normalized.includes("vite") ||
        normalized.includes(normalizePath(projectRoot))
      ) {
        items.push({ pid: procId, commandLine });
      }
    } catch {
      // Ignore processes that disappear while we inspect them.
    }
  }

  return items;
}

function collectProjectNodeProcesses() {
  return process.platform === "win32"
    ? collectProjectNodeProcessIdsOnWindows()
    : collectProjectNodeProcessIdsOnUnix();
}

function stopExistingProjectProcesses() {
  const staleProcesses = collectProjectNodeProcesses().filter((item) => item.pid !== process.pid);

  if (staleProcesses.length === 0) {
    return;
  }

  console.log("Stopping stale Airtel IMS dev processes:");
  for (const staleProcess of staleProcesses) {
    console.log(`- PID ${staleProcess.pid}: ${staleProcess.commandLine}`);
    try {
      process.kill(staleProcess.pid, "SIGTERM");
    } catch {
      // Ignore processes that already exited.
    }
  }
}

function startProcess(name, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (code !== 0) {
      console.error(`${name} exited with code ${code ?? "unknown"}${signal ? ` (signal: ${signal})` : ""}.`);
      shutdown(code ?? 1);
      return;
    }

    console.log(`${name} exited.`);
    shutdown(0);
  });

  child.on("error", (error) => {
    console.error(`Failed to start ${name}: ${error.message}`);
    shutdown(1);
  });

  processes.push(child);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

stopExistingProjectProcesses();

startProcess("Backend", "node", ["server.js"], path.join(projectRoot, "backend"));
startProcess("Frontend", "node", ["node_modules/vite/bin/vite.js"], projectRoot);
