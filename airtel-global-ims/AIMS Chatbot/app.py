import json
from pathlib import Path

import joblib
from flask import Flask, jsonify, request


BASE_DIR = Path(__file__).resolve().parent
TRAINING_FILE = BASE_DIR / "training_data.json"
MODEL_FILE = BASE_DIR / "intent_model.joblib"

app = Flask(__name__)


def ensure_model():
    if not MODEL_FILE.exists():
      from train import train_model
      train_model()
    return joblib.load(MODEL_FILE)


def load_suggestions():
    payload = json.loads(TRAINING_FILE.read_text(encoding="utf-8"))
    return {intent["tag"]: intent["patterns"][:3] for intent in payload["intents"]}


MODEL = ensure_model()
SUGGESTIONS = load_suggestions()


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/classify")
def classify():
    body = request.get_json(silent=True) or {}
    message = str(body.get("message") or "").strip()
    role = str(body.get("role") or "").strip()

    if not message:
        return jsonify({"message": "A message is required."}), 400

    probabilities = MODEL.predict_proba([message])[0]
    labels = MODEL.classes_
    best_index = int(probabilities.argmax())
    intent = str(labels[best_index])
    confidence = float(probabilities[best_index])

    return jsonify(
        {
            "intent": intent,
            "confidence": confidence,
            "role": role,
            "suggestions": SUGGESTIONS.get(intent, []),
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8010, debug=False)
