import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


BASE_DIR = Path(__file__).resolve().parent
TRAINING_FILE = BASE_DIR / "training_data.json"
MODEL_FILE = BASE_DIR / "intent_model.joblib"


def load_training_examples():
    payload = json.loads(TRAINING_FILE.read_text(encoding="utf-8"))
    texts = []
    labels = []

    for intent in payload["intents"]:
        tag = intent["tag"]
        for pattern in intent["patterns"]:
            texts.append(pattern)
            labels.append(tag)

    return texts, labels


def train_model():
    texts, labels = load_training_examples()
    pipeline = Pipeline(
        steps=[
            ("vectorizer", TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
            ("classifier", LogisticRegression(max_iter=2000, random_state=42)),
        ]
    )
    pipeline.fit(texts, labels)
    joblib.dump(pipeline, MODEL_FILE)
    print(f"Saved chatbot intent model to {MODEL_FILE}")


if __name__ == "__main__":
    train_model()
