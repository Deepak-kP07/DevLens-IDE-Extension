import json
import sys
from pathlib import Path
import joblib


def load_models(base_path: Path):
    type_path = base_path / "type_model.pkl"
    severity_path = base_path / "severity_model.pkl"

    if not type_path.exists() or not severity_path.exists():
        return None, None
    return joblib.load(type_path), joblib.load(severity_path)


def classify(message: str):
    base = Path(__file__).parent
    type_model, severity_model = load_models(base)
    if type_model is None or severity_model is None:
        return {"type": "UnknownType", "severity": "UnknownSeverity"}

    predicted_type = type_model.predict([message])[0]
    predicted_severity = severity_model.predict([message])[0]
    return {"type": str(predicted_type), "severity": str(predicted_severity)}


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"type": "UnknownType", "severity": "UnknownSeverity"}))
        return

    try:
        payload = json.loads(raw)
        message = str(payload.get("message", ""))
    except Exception:
        message = raw

    print(json.dumps(classify(message)))


if __name__ == "__main__":
    main()
