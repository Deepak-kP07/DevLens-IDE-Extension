import json
from pathlib import Path
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


def train_model(texts, labels):
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer()),
            ("clf", LinearSVC()),
        ]
    ).fit(texts, labels)


def main():
    base = Path(__file__).parent
    data = json.loads((base / "training_data.json").read_text())
    texts = [item["message"] for item in data]
    type_labels = [item["type"] for item in data]
    severity_labels = [item["severity"] for item in data]

    type_model = train_model(texts, type_labels)
    severity_model = train_model(texts, severity_labels)

    joblib.dump(type_model, base / "type_model.pkl")
    joblib.dump(severity_model, base / "severity_model.pkl")
    print("models-trained")


if __name__ == "__main__":
    main()
