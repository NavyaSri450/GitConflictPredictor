"""Load and use the saved exploratory model outside the HTTP route layer."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd

from ml.features import FEATURE_NAMES, MODEL_FEATURES
from ml.predict import load_model_bundle, predict_conflict_probability

logger = logging.getLogger(__name__)

EXPECTED_CLASS_MAPPING = {"0": "clean_merge", "1": "merge_conflict"}


class ModelUnavailableError(RuntimeError):
    """Raised when the validated local model bundle is not available."""


class ModelPredictionError(RuntimeError):
    """Raised when the loaded estimator returns invalid output."""


class ModelService:
    """A process-local model holder loaded once during application startup."""

    def __init__(
        self,
        model_path: Path | None = None,
        loader: Callable[[str | Path], dict[str, Any]] = load_model_bundle,
    ) -> None:
        self._model_path = model_path
        self._loader = loader
        self._bundle: dict[str, Any] | None = None

    @property
    def is_ready(self) -> bool:
        return self._bundle is not None

    def load(self) -> None:
        """Load and validate the fixed artifact; failure leaves API alive but unready."""
        try:
            if self._model_path is None:
                from app.core.config import settings

                model_path = settings.model_path
            else:
                model_path = self._model_path
            bundle = self._loader(model_path)
            self._validate_bundle(bundle)
            self._bundle = bundle
            logger.info("Exploratory GitNexus Random Forest model loaded.")
        except Exception:  # Artifact errors must not prevent health checks.
            self._bundle = None
            logger.exception("GitNexus model loading failed; prediction readiness is unavailable.")

    @staticmethod
    def _validate_bundle(bundle: dict[str, Any]) -> None:
        if not isinstance(bundle, dict):
            raise ValueError("Model bundle must be a dictionary.")
        if bundle.get("model_name") != "random_forest":
            raise ValueError("Unexpected model name.")
        if bundle.get("feature_names") != list(MODEL_FEATURES):
            raise ValueError("Model feature order does not match the five-feature API inputs.")
        if bundle.get("api_feature_names") != list(FEATURE_NAMES):
            raise ValueError("Model API metadata does not match the 18-feature contract.")
        if bundle.get("class_mapping") != EXPECTED_CLASS_MAPPING:
            raise ValueError("Model class mapping is missing or inconsistent.")
        if bundle.get("production_ready") is not False or bundle.get("artifact_type") != "exploratory":
            raise ValueError("The artifact must be explicitly marked exploratory.")
        estimator = bundle.get("estimator")
        if not callable(getattr(estimator, "predict", None)) or not callable(getattr(estimator, "predict_proba", None)):
            raise ValueError("Model estimator does not support prediction and probabilities.")
        if list(getattr(estimator, "classes_", [])) != [0, 1]:
            raise ValueError("Model must expose the expected clean/conflict classes.")

    def _require_bundle(self) -> dict[str, Any]:
        if self._bundle is None:
            raise ModelUnavailableError("The exploratory prediction model is unavailable.")
        return self._bundle

    def model_info(self) -> dict[str, Any]:
        bundle = self._bundle
        estimator = bundle.get("estimator") if bundle else None
        final_estimator = getattr(estimator, "named_steps", {}).get("model") if estimator is not None else None
        return {
            "model_name": bundle.get("model_name", "unavailable") if bundle else "unavailable",
            "model_type": type(final_estimator).__name__ if final_estimator is not None else None,
            "model_status": "exploratory_available" if bundle else "unavailable",
            "supported_features": list(MODEL_FEATURES),
            "supported_feature_count": len(MODEL_FEATURES),
            "feature_contract_size": len(FEATURE_NAMES),
            "class_mapping": dict(bundle.get("class_mapping", EXPECTED_CLASS_MAPPING)) if bundle else dict(EXPECTED_CLASS_MAPPING),
            "dataset_sha256": bundle.get("dataset_sha256") if bundle else None,
        }

    def predict(self, request: dict[str, Any]) -> dict[str, Any]:
        bundle = self._require_bundle()
        features = {name: request[name] for name in MODEL_FEATURES}
        try:
            conflict_probability = predict_conflict_probability(bundle, features)
            estimator = bundle["estimator"]
            ordered_input = pd.DataFrame([features], columns=MODEL_FEATURES)
            predicted_value = estimator.predict(ordered_input)[0]
            if isinstance(predicted_value, (bool, np.bool_)) or predicted_value not in (0, 1):
                raise ModelPredictionError("The model returned an unsupported class.")
            probabilities = estimator.predict_proba(ordered_input)[0]
            classes = list(estimator.classes_)
            if len(probabilities) != len(classes) or not np.isfinite(probabilities).all():
                raise ModelPredictionError("The model returned invalid class scores.")
            score_by_class = {int(label): float(score) for label, score in zip(classes, probabilities, strict=True)}
            clean_probability = score_by_class.get(0)
            if (
                clean_probability is None
                or not 0 <= clean_probability <= 1
                or not 0 <= conflict_probability <= 1
                or not np.isclose(clean_probability + conflict_probability, 1.0, atol=1e-6)
            ):
                raise ModelPredictionError("The model returned incomplete class scores.")
            prediction = int(predicted_value)
        except ModelPredictionError:
            raise
        except Exception as error:
            logger.exception("The loaded GitNexus model failed to score a request.")
            raise ModelPredictionError("The model could not score this request.") from error

        mapping = bundle["class_mapping"]
        predicted_class = mapping[str(prediction)]
        label = "Clean merge estimate" if prediction == 0 else "Merge conflict risk detected"
        return {
            "prediction": prediction,
            "prediction_label": label,
            "predicted_class": predicted_class,
            "class_probabilities": {
                "clean_merge": clean_probability,
                "merge_conflict": conflict_probability,
            },
            "probability_note": "These are raw exploratory model probabilities and are not calibrated confidence or a guarantee of merge outcome.",
            "model_name": bundle["model_name"],
            "model_status": "exploratory; not production validated",
            "features_used": list(MODEL_FEATURES),
            "predicted_at": datetime.now(timezone.utc).isoformat(),
            "message": "Exploratory estimate only. Always review and attempt merges using your normal Git workflow.",
        }
