from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV_PATH = REPO_ROOT.parent / "IoT_Failure_Prediction_Dataset.csv"
DEFAULT_MODEL_PATH = REPO_ROOT / "backend" / "models" / "iot_failure_model.pkl"
DEFAULT_METRICS_PATH = REPO_ROOT / "backend" / "models" / "iot_failure_metrics.json"
DEFAULT_JSON_MODEL_PATH = REPO_ROOT / "backend" / "models" / "iot_failure_model.json"
MODEL_FEATURE_NAMES = [
    "cpu_usage",
    "memory_usage",
    "battery_level",
    "network_latency",
    "packet_loss",
    "temperature",
    "uptime",
    "workload_intensity",
    "error_count",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an IoT device failure prediction model from CSV data.")
    parser.add_argument("--csv", default=str(DEFAULT_CSV_PATH), help="Path to the IoT failure dataset CSV.")
    parser.add_argument("--model-out", default=str(DEFAULT_MODEL_PATH), help="Where to save the trained random forest pickle.")
    parser.add_argument("--metrics-out", default=str(DEFAULT_METRICS_PATH), help="Where to save training metrics JSON.")
    parser.add_argument("--json-model-out", default=str(DEFAULT_JSON_MODEL_PATH), help="Where to save a Node-compatible JSON model.")
    parser.add_argument("--test-size", type=float, default=0.2, help="Holdout test split ratio.")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed for reproducibility.")
    return parser.parse_args()


def load_dataset(csv_path: Path) -> tuple[pd.DataFrame, pd.Series]:
    frame = pd.read_csv(csv_path, encoding="utf-8-sig")
    frame.columns = [column.replace("Ã‚", "").strip() for column in frame.columns]

    if "Failure_Type" not in frame.columns:
        raise ValueError("The dataset must include a 'Failure_Type' target column.")

    feature_columns = [column for column in frame.columns if column not in {"Failure_Type", "Device_ID"}]
    features = frame[feature_columns].apply(pd.to_numeric, errors="coerce")
    target = frame["Failure_Type"].astype(str)
    return features, target


def build_multiclass_model(random_state: int) -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=12,
                    min_samples_leaf=2,
                    random_state=random_state,
                    class_weight="balanced_subsample",
                    n_jobs=1,
                ),
            ),
        ]
    )


def build_deployment_model(random_state: int) -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=2000,
                    random_state=random_state,
                ),
            ),
        ]
    )


def train_and_evaluate(
    features: pd.DataFrame,
    target: pd.Series,
    test_size: float,
    random_state: int,
) -> tuple[Pipeline, dict, dict]:
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=test_size,
        random_state=random_state,
        stratify=target,
    )

    multiclass_model = build_multiclass_model(random_state)
    multiclass_model.fit(x_train, y_train)
    multiclass_predictions = multiclass_model.predict(x_test)

    labels = sorted(target.unique())
    multiclass_metrics = {
        "dataset_rows": int(len(features)),
        "feature_columns": list(features.columns),
        "class_labels": labels,
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "accuracy": float(accuracy_score(y_test, multiclass_predictions)),
        "macro_f1": float(f1_score(y_test, multiclass_predictions, average="macro")),
        "weighted_f1": float(f1_score(y_test, multiclass_predictions, average="weighted")),
        "classification_report": classification_report(y_test, multiclass_predictions, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, multiclass_predictions, labels=labels).tolist(),
    }

    y_train_binary = (y_train.astype(int) > 0).astype(int)
    y_test_binary = (y_test.astype(int) > 0).astype(int)

    deployment_model = build_deployment_model(random_state)
    deployment_model.fit(x_train, y_train_binary)
    deployment_probabilities = deployment_model.predict_proba(x_test)[:, 1]
    deployment_predictions = (deployment_probabilities >= 0.5).astype(int)

    imputer = deployment_model.named_steps["imputer"]
    scaler = deployment_model.named_steps["scaler"]
    classifier = deployment_model.named_steps["classifier"]
    deployment_metrics = {
        "dataset_rows": int(len(features)),
        "feature_columns": MODEL_FEATURE_NAMES,
        "label": "binary_failure_risk",
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "positive_rate": float(y_train_binary.mean()),
        "accuracy": float(accuracy_score(y_test_binary, deployment_predictions)),
        "f1": float(f1_score(y_test_binary, deployment_predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test_binary, deployment_probabilities)),
    }
    deployment_artifact = {
        "key": "device_failure",
        "version": f"py-{pd.Timestamp.utcnow().strftime('%Y%m%d%H%M%S')}",
        "featureNames": MODEL_FEATURE_NAMES,
        "weights": [float(value) for value in classifier.coef_[0].tolist()],
        "intercept": float(classifier.intercept_[0]),
        "preprocessing": {
            "medianImputer": {
                "statistics": [float(value) for value in imputer.statistics_.tolist()],
            },
            "standardScaler": {
                "mean": [float(value) for value in scaler.mean_.tolist()],
                "scale": [float(value) for value in scaler.scale_.tolist()],
            },
        },
        "metrics": deployment_metrics,
        "createdAt": pd.Timestamp.utcnow().isoformat(),
    }

    return multiclass_model, multiclass_metrics, deployment_artifact


def save_outputs(
    multiclass_model: Pipeline,
    multiclass_metrics: dict,
    deployment_artifact: dict,
    model_path: Path,
    metrics_path: Path,
    json_model_path: Path,
) -> None:
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    json_model_path.parent.mkdir(parents=True, exist_ok=True)

    with model_path.open("wb") as model_file:
        pickle.dump(multiclass_model, model_file)

    with metrics_path.open("w", encoding="utf-8") as metrics_file:
        json.dump(
            {
                "multiclass_random_forest": multiclass_metrics,
                "deployment_binary_logistic": deployment_artifact["metrics"],
            },
            metrics_file,
            indent=2,
        )

    with json_model_path.open("w", encoding="utf-8") as json_model_file:
        json.dump(deployment_artifact, json_model_file, indent=2)


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv).resolve()
    model_path = Path(args.model_out).resolve()
    metrics_path = Path(args.metrics_out).resolve()
    json_model_path = Path(args.json_model_out).resolve()

    features, target = load_dataset(csv_path)
    multiclass_model, multiclass_metrics, deployment_artifact = train_and_evaluate(
        features=features,
        target=target,
        test_size=args.test_size,
        random_state=args.random_state,
    )
    save_outputs(multiclass_model, multiclass_metrics, deployment_artifact, model_path, metrics_path, json_model_path)

    print("Training complete.")
    print(f"Dataset: {csv_path}")
    print(f"Random forest model saved to: {model_path}")
    print(f"Node JSON model saved to: {json_model_path}")
    print(f"Metrics saved to: {metrics_path}")
    print(f"Multiclass accuracy: {multiclass_metrics['accuracy']:.4f}")
    print(f"Multiclass macro F1: {multiclass_metrics['macro_f1']:.4f}")
    print(f"Binary deployment accuracy: {deployment_artifact['metrics']['accuracy']:.4f}")
    print(f"Binary deployment ROC AUC: {deployment_artifact['metrics']['roc_auc']:.4f}")


if __name__ == "__main__":
    main()
