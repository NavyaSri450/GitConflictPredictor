"""Load a local baseline bundle and score its five selected model inputs.

This module is not connected to FastAPI. Only load model artifacts created by
this project's training code; joblib artifacts are executable Python objects.
"""

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ml.features import FEATURE_BY_NAME, FEATURE_NAMES, INTEGER_FEATURES, MODEL_FEATURES
from ml.training.pipeline import BUNDLE_VERSION


def load_model_bundle(path: str | Path) -> dict[str, Any]:
    model_path = Path(path)
    if not model_path.is_file():
        raise FileNotFoundError(f"No trained model bundle exists at {model_path}.")
    bundle = joblib.load(model_path)
    if not isinstance(bundle, dict) or bundle.get("bundle_version") != BUNDLE_VERSION:
        raise ValueError("Unsupported or invalid GitNexus model bundle.")
    if bundle.get("feature_names") != list(MODEL_FEATURES) or bundle.get("api_feature_names") != list(FEATURE_NAMES) or not hasattr(bundle.get("estimator"), "predict_proba"):
        raise ValueError("Model bundle does not match the documented five-feature baseline and 18-field API contract.")
    return bundle


def predict_conflict_probability(bundle: dict[str, Any], features: dict[str, float | int]) -> float:
    """Score the five documented model inputs; extra API fields are ignored."""
    missing = [name for name in MODEL_FEATURES if name not in features]
    if missing:
        raise ValueError("Missing prediction inputs: " + ", ".join(missing))
    row: dict[str, float] = {}
    for name in MODEL_FEATURES:
        value = features[name]
        spec = FEATURE_BY_NAME[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
            raise ValueError(f"{name} must be a finite number.")
        if value < spec.minimum or (spec.maximum is not None and value > spec.maximum):
            raise ValueError(f"{name} is outside its supported range.")
        if name in INTEGER_FEATURES and int(value) != value:
            raise ValueError(f"{name} must be a whole number.")
        row[name] = float(value)
    estimator = bundle["estimator"]
    classes = list(estimator.classes_)
    if 1 not in classes:
        raise ValueError("The trained model has no positive conflict class.")
    probability = float(estimator.predict_proba(pd.DataFrame([row], columns=MODEL_FEATURES))[0, classes.index(1)])
    if not np.isfinite(probability) or not 0 <= probability <= 1:
        raise ValueError("The model returned an invalid probability.")
    return probability
