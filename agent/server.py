"""
Device Health System - Central Server
=======================================
Supports Anthropic (Claude), OpenAI (GPT-4o), or DeepSeek.
Set AI_PROVIDER and AI_API_KEY in your .env file.

Install deps:  pip install -r requirements.txt
Run:           python server.py
Production:    gunicorn -w 4 -b 0.0.0.0:5000 server:app
"""

import os
import json
import logging
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Text, func
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────
AGENT_API_KEY  = os.getenv("AGENT_API_KEY", "changeme-secret-key")
AI_PROVIDER    = os.getenv("AI_PROVIDER", "anthropic").lower()   # anthropic | openai | deepseek
AI_API_KEY     = os.getenv("AI_API_KEY", "")
DATABASE_URL   = os.getenv("DATABASE_URL", "sqlite:///device_health.db")
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "30"))

# ── Model names per provider ───────────────
AI_MODELS = {
    "anthropic": "claude-opus-4-6",   # updated: was claude-opus-4-5
    "openai":    "gpt-4o",
    "deepseek":  "deepseek-chat",
}

# ── Base URLs per provider ─────────────────
AI_BASE_URLS = {
    "anthropic": None,                          # uses SDK default
    "openai":    None,                          # uses SDK default
    "deepseek":  "https://api.deepseek.com",    # OpenAI-compatible endpoint
}
# ─────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

# ── Database ──────────────────────────────
Base    = declarative_base()
engine  = create_engine(DATABASE_URL, echo=False)
Session = sessionmaker(bind=engine)


class DeviceTelemetry(Base):
    __tablename__ = "device_telemetry"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    device_id   = Column(String(128), index=True)
    device_name = Column(String(128))
    location    = Column(String(256))
    platform    = Column(String(64))
    os_version  = Column(Text)
    ip_address  = Column(String(64))
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)

    cpu         = Column(Float)
    memory      = Column(Float)
    battery     = Column(Float)
    temperature = Column(Float)
    uptime      = Column(Float)
    latency     = Column(Float)
    packet_loss = Column(Float)
    errors      = Column(Integer)
    workload    = Column(Integer)

    ai_status     = Column(String(32))
    ai_confidence = Column(Float)
    ai_summary    = Column(Text)
    ai_updated_at = Column(DateTime)


Base.metadata.create_all(engine)


# ── Auth ───────────────────────────────────
def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        key = request.headers.get("X-API-Key") or request.args.get("api_key")
        if key != AGENT_API_KEY:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ══════════════════════════════════════════
#  AI PREDICTION  —  works with any provider
# ══════════════════════════════════════════

def _build_prompt(row: DeviceTelemetry) -> str:
    return f"""You are a device health prediction AI. Analyze this device telemetry and return ONLY a JSON object.

Device: {row.device_name} ({row.platform}) at {row.location}
CPU: {row.cpu}%, Memory: {row.memory}%, Battery: {row.battery}%
Network latency: {row.latency}ms, Packet loss: {row.packet_loss}%
Temperature: {row.temperature}°C, Uptime: {row.uptime}hrs
Workload: {row.workload}/10, Errors: {row.errors}

Return ONLY valid JSON (no markdown, no extra text):
{{
  "status": "healthy" | "risk" | "fail",
  "confidence": <integer 0-100>,
  "summary": "<2-3 sentences explaining the assessment>"
}}"""


def _call_anthropic(prompt: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=AI_API_KEY)
    message = client.messages.create(
        model=AI_MODELS["anthropic"],
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text


def _call_openai_compatible(prompt: str, provider: str) -> str:
    """Works for both OpenAI and DeepSeek (same SDK, different base_url)."""
    from openai import OpenAI
    kwargs = {"api_key": AI_API_KEY}
    base_url = AI_BASE_URLS.get(provider)
    if base_url:
        kwargs["base_url"] = base_url
    client = OpenAI(**kwargs)
    response = client.chat.completions.create(
        model=AI_MODELS[provider],
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


def run_ai_prediction(row: DeviceTelemetry) -> dict:
    """Call whichever AI provider is configured and parse the result."""
    if not AI_API_KEY:
        return {"status": "unknown", "confidence": 0, "summary": "No AI API key configured."}

    prompt = _build_prompt(row)

    try:
        if AI_PROVIDER == "anthropic":
            raw = _call_anthropic(prompt)
        elif AI_PROVIDER in ("openai", "deepseek"):
            raw = _call_openai_compatible(prompt, AI_PROVIDER)
        else:
            return {"status": "unknown", "confidence": 0,
                    "summary": f"Unknown AI_PROVIDER '{AI_PROVIDER}'. Use anthropic, openai, or deepseek."}

        clean = raw.strip().replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        log.info(f"[{AI_PROVIDER}] {row.device_name} → {result.get('status')} ({result.get('confidence')}%)")
        return result

    except Exception as e:
        log.error(f"AI prediction error ({AI_PROVIDER}): {e}")
        return {"status": "unknown", "confidence": 0, "summary": f"AI error: {str(e)}"}


def run_daily_report(fleet_text: str) -> str:
    """Generate a prose fleet report using whichever provider is active."""
    prompt = f"""You are a fleet health analyst. Write a concise daily health report.
Include: overall fleet status, top concerns, recommended actions.

Fleet data (last 24h):
{fleet_text}

Write in plain text, 3-5 paragraphs, professional tone."""

    if AI_PROVIDER == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=AI_API_KEY)
        msg = client.messages.create(
            model=AI_MODELS["anthropic"],
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    elif AI_PROVIDER in ("openai", "deepseek"):
        from openai import OpenAI
        kwargs = {"api_key": AI_API_KEY}
        base_url = AI_BASE_URLS.get(AI_PROVIDER)
        if base_url:
            kwargs["base_url"] = base_url
        client = OpenAI(**kwargs)
        resp = client.chat.completions.create(
            model=AI_MODELS[AI_PROVIDER],
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return resp.choices[0].message.content
    return "No AI provider configured."


# ══════════════════════════════════════════
#  API ROUTES
# ══════════════════════════════════════════

@app.route("/api/telemetry", methods=["POST"])
@require_api_key
def receive_telemetry():
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    session = Session()
    try:
        ts = data.get("timestamp")
        ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None) if ts else datetime.utcnow()

        row = DeviceTelemetry(
            device_id   = data.get("device_id", "unknown"),
            device_name = data.get("device_name", data.get("device_id", "unknown")),
            location    = data.get("location", "Unknown"),
            platform    = data.get("platform", "Unknown"),
            os_version  = data.get("os_version", ""),
            ip_address  = data.get("ip_address", request.remote_addr),
            timestamp   = ts,
            cpu         = float(data.get("cpu", 0)),
            memory      = float(data.get("memory", 0)),
            battery     = float(data.get("battery", 100)),
            temperature = float(data.get("temperature", 0)),
            uptime      = float(data.get("uptime", 0)),
            latency     = float(data.get("latency", 0)),
            packet_loss = float(data.get("packet_loss", 0)),
            errors      = int(data.get("errors", 0)),
            workload    = int(data.get("workload", 1)),
        )
        session.add(row)
        session.commit()

        import threading
        threading.Thread(target=_update_ai_prediction, args=(row.id,), daemon=True).start()

        log.info(f"Telemetry received from {row.device_name} @ {row.location}")
        return jsonify({"status": "ok", "id": row.id})

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


def _update_ai_prediction(row_id: int):
    session = Session()
    try:
        row = session.get(DeviceTelemetry, row_id)
        if not row:
            return
        result = run_ai_prediction(row)
        row.ai_status     = result.get("status", "unknown")
        row.ai_confidence = float(result.get("confidence", 0))
        row.ai_summary    = result.get("summary", "")
        row.ai_updated_at = datetime.utcnow()
        session.commit()
    except Exception as e:
        session.rollback()
        log.error(f"AI update error for row {row_id}: {e}")
    finally:
        session.close()


@app.route("/api/devices/latest", methods=["GET"])
@require_api_key
def get_latest_devices():
    session = Session()
    try:
        sub = (
            session.query(DeviceTelemetry.device_id,
                          func.max(DeviceTelemetry.timestamp).label("max_ts"))
            .group_by(DeviceTelemetry.device_id).subquery()
        )
        rows = (
            session.query(DeviceTelemetry)
            .join(sub, (DeviceTelemetry.device_id == sub.c.device_id) &
                       (DeviceTelemetry.timestamp == sub.c.max_ts))
            .all()
        )
        return jsonify([_row_to_dict(r) for r in rows])
    finally:
        session.close()


@app.route("/api/devices/<device_id>/history", methods=["GET"])
@require_api_key
def get_device_history(device_id: str):
    limit = int(request.args.get("limit", 50))
    session = Session()
    try:
        rows = (
            session.query(DeviceTelemetry)
            .filter(DeviceTelemetry.device_id == device_id)
            .order_by(DeviceTelemetry.timestamp.desc())
            .limit(limit).all()
        )
        return jsonify([_row_to_dict(r) for r in rows])
    finally:
        session.close()


@app.route("/api/devices/<device_id>/predict", methods=["POST"])
@require_api_key
def predict_device(device_id: str):
    session = Session()
    try:
        row = (
            session.query(DeviceTelemetry)
            .filter(DeviceTelemetry.device_id == device_id)
            .order_by(DeviceTelemetry.timestamp.desc()).first()
        )
        if not row:
            return jsonify({"error": "Device not found"}), 404
        result = run_ai_prediction(row)
        row.ai_status     = result.get("status")
        row.ai_confidence = result.get("confidence")
        row.ai_summary    = result.get("summary")
        row.ai_updated_at = datetime.utcnow()
        session.commit()
        return jsonify(result)
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/api/summary", methods=["GET"])
@require_api_key
def get_summary():
    session = Session()
    try:
        sub = (
            session.query(DeviceTelemetry.device_id,
                          func.max(DeviceTelemetry.timestamp).label("max_ts"))
            .group_by(DeviceTelemetry.device_id).subquery()
        )
        rows = (
            session.query(DeviceTelemetry)
            .join(sub, (DeviceTelemetry.device_id == sub.c.device_id) &
                       (DeviceTelemetry.timestamp == sub.c.max_ts))
            .all()
        )
        statuses = [r.ai_status for r in rows if r.ai_status]
        return jsonify({
            "total":   len(rows),
            "healthy": statuses.count("healthy"),
            "risk":    statuses.count("risk"),
            "fail":    statuses.count("fail"),
            "unknown": len(rows) - len(statuses),
            "avg_cpu": round(sum(r.cpu or 0 for r in rows) / len(rows), 1) if rows else 0,
            "avg_mem": round(sum(r.memory or 0 for r in rows) / len(rows), 1) if rows else 0,
        })
    finally:
        session.close()


@app.route("/api/report/daily", methods=["GET"])
@require_api_key
def daily_report():
    session = Session()
    try:
        since = datetime.utcnow() - timedelta(hours=24)
        rows  = session.query(DeviceTelemetry).filter(DeviceTelemetry.timestamp >= since).all()
        if not rows:
            return jsonify({"report": "No telemetry data in the last 24 hours."})

        device_summaries = {}
        for r in rows:
            device_summaries.setdefault(r.device_id, []).append(r)

        lines = []
        for dev_id, readings in device_summaries.items():
            last    = readings[-1]
            avg_cpu = round(sum(r.cpu or 0 for r in readings) / len(readings), 1)
            avg_mem = round(sum(r.memory or 0 for r in readings) / len(readings), 1)
            lines.append(
                f"- {last.device_name} ({last.location}): avg CPU {avg_cpu}%, "
                f"avg MEM {avg_mem}%, status={last.ai_status or 'unknown'}"
            )

        report = run_daily_report("\n".join(lines))
        return jsonify({"report": report, "generated_at": datetime.utcnow().isoformat(),
                        "provider": AI_PROVIDER})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


def _row_to_dict(r: DeviceTelemetry) -> dict:
    return {
        "id": r.id, "device_id": r.device_id, "device_name": r.device_name,
        "location": r.location, "platform": r.platform, "os_version": r.os_version,
        "ip_address": r.ip_address,
        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        "cpu": r.cpu, "memory": r.memory, "battery": r.battery,
        "temperature": r.temperature, "uptime": r.uptime, "latency": r.latency,
        "packet_loss": r.packet_loss, "errors": r.errors, "workload": r.workload,
        "ai_status": r.ai_status, "ai_confidence": r.ai_confidence,
        "ai_summary": r.ai_summary,
        "ai_updated_at": r.ai_updated_at.isoformat() if r.ai_updated_at else None,
    }


if __name__ == "__main__":
    log.info(f"Starting server — AI provider: {AI_PROVIDER.upper()}")
    app.run(host="0.0.0.0", port=5000, debug=False)