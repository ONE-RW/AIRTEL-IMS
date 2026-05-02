import { spawn } from "node:child_process";

const preferredPort = Number(process.env.PORT || 4200);
const maxPortAttempts = 10;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isHrmsHealthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    if (!response.ok) {
      return false;
    }

    const payload = await response.json().catch(() => null);
    return payload?.service === "HRMS";
  } catch {
    return false;
  }
}

async function findRunnablePort() {
  for (let offset = 0; offset < maxPortAttempts; offset += 1) {
    const candidatePort = preferredPort + offset;
    const healthy = await isHrmsHealthy(candidatePort);

    if (healthy) {
      return { port: candidatePort, alreadyRunning: true };
    }

    await wait(120);

    const healthyAfterPause = await isHrmsHealthy(candidatePort);

    if (healthyAfterPause) {
      return { port: candidatePort, alreadyRunning: true };
    }
  }

  for (let offset = 0; offset < maxPortAttempts; offset += 1) {
    const candidatePort = preferredPort + offset;
    const healthy = await isHrmsHealthy(candidatePort);

    if (healthy) {
      return { port: candidatePort, alreadyRunning: true };
    }
  }

  return { port: preferredPort, alreadyRunning: false };
}

async function start() {
  const result = await findRunnablePort();

  if (result.alreadyRunning) {
    console.log(`HRMS is already running on http://127.0.0.1:${result.port}/`);
    process.exit(0);
  }

  console.log(`Starting HRMS dev server on http://127.0.0.1:${result.port}/`);

  const child = spawn(process.execPath, ["--watch", "server.js"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(result.port),
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

start().catch((error) => {
  console.error("Failed to launch HRMS dev server:", error);
  process.exit(1);
});
