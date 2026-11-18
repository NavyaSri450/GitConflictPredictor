"""Small, group-aware robustness review for the saved exploratory baseline."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import balanced_accuracy_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline

from ml.data.validate import validate_csv
from ml.features import MODEL_FEATURES, TARGET_COLUMN
from ml.predict import load_model_bundle
from ml.training.pipeline import _cv_splits, _positive_probability, _score, make_split

SEED_SET = (42, 7, 21, 84, 123)
PERMUTATIONS = 25


def _forest(seed: int) -> Pipeline:
    """Recreate the saved RF pipeline; only its random seed is varied."""
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
        ("model", RandomForestClassifier(
            n_estimators=200,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=seed,
            n_jobs=1,
        )),
    ])


def _row_identity(row: pd.Series) -> dict[str, Any]:
    keys = (
        "repository_id", "repo_fingerprint", "source_ref", "target_ref",
        "source_commit", "target_commit", "merge_base",
    )
    return {key: (None if pd.isna(row.get(key)) else str(row.get(key))) for key in keys if key in row.index}


def _importance(frame: pd.DataFrame, split: Any, folds: list[tuple[np.ndarray, np.ndarray]]) -> dict[str, Any]:
    """Permutation importance only on group-CV validation rows, never holdout rows."""
    train = frame.iloc[split.train_indices].reset_index(drop=True)
    x = train[list(MODEL_FEATURES)]
    y = train[TARGET_COLUMN].to_numpy()
    groups = train["repo_fingerprint"].astype(str).to_numpy()
    random = np.random.default_rng(4207)
    results: dict[str, list[float]] = {feature: [] for feature in MODEL_FEATURES}
    fold_details: list[dict[str, Any]] = []
    for fold_index, (train_idx, valid_idx) in enumerate(folds, start=1):
        y_valid = y[valid_idx]
        if len(np.unique(y_valid)) < 2:
            fold_details.append({"fold": fold_index, "used": False, "reason": "balanced accuracy permutation requires both validation labels"})
            continue
        estimator = _forest(42).fit(x.iloc[train_idx], y[train_idx])
        valid_x = x.iloc[valid_idx].copy()
        baseline = balanced_accuracy_score(y_valid, estimator.predict(valid_x))
        for feature in MODEL_FEATURES:
            decreases = []
            for _ in range(PERMUTATIONS):
                permuted = valid_x.copy()
                # Permute observed values and missingness together. This preserves the
                # feature's missing-value pattern as part of the measured input.
                permuted[feature] = random.permutation(permuted[feature].to_numpy())
                score = balanced_accuracy_score(y_valid, estimator.predict(permuted))
                decreases.append(float(baseline - score))
            results[feature].append(float(np.mean(decreases)))
        fold_details.append({
            "fold": fold_index,
            "used": True,
            "validation_rows": len(valid_idx),
            "validation_repository_groups": int(len(np.unique(groups[valid_idx]))),
            "baseline_balanced_accuracy": float(baseline),
        })
    summary = {}
    for feature, values in results.items():
        summary[feature] = {
            "mean_balanced_accuracy_decrease": float(np.mean(values)) if values else None,
            "std_across_folds": float(np.std(values, ddof=0)) if values else None,
            "fold_values": values,
        }
    return {
        "method": "validation-fold permutation; group-CV only; no held-out rows; 25 permutations per feature/fold",
        "folds": fold_details,
        "feature_importance": summary,
        "caveat": "Small folds make these importance estimates noisy and descriptive only.",
    }


def build_robustness_report(dataset_path: str | Path, model_path: str | Path) -> dict[str, Any]:
    raw_bytes = Path(dataset_path).read_bytes()
    digest = hashlib.sha256(raw_bytes).hexdigest()
    frame, validation = validate_csv(dataset_path)
    if not validation.valid:
        raise ValueError("Dataset validation failed: " + " ".join(validation.errors))
    bundle = load_model_bundle(model_path)
    if bundle.get("model_name") != "random_forest":
        raise ValueError("Saved artifact is not the verified Random Forest baseline.")
    if bundle.get("dataset_sha256") != digest:
        raise ValueError("Saved model dataset checksum does not match the supplied processed dataset.")
    estimator = bundle["estimator"]
    if list(estimator.named_steps["imputer"].feature_names_in_) != list(MODEL_FEATURES):
        raise ValueError("Saved Random Forest input feature order does not match MODEL_FEATURES.")

    split = make_split(frame)
    folds, cv_method = _cv_splits(frame, split)
    train = frame.iloc[split.train_indices].reset_index(drop=True)
    x, y = train[list(MODEL_FEATURES)], train[TARGET_COLUMN].to_numpy()
    groups = train["repo_fingerprint"].astype(str).to_numpy()

    # Fixed, group-disjoint OOF fold assignments match the established Stage 7A policy.
    oof_pred = np.empty(len(train), dtype=int)
    oof_prob = np.empty(len(train), dtype=float)
    oof_seen = np.zeros(len(train), dtype=bool)
    fold_rows = []
    group_cv = cv_method == "group_k_fold"
    for fold_index, (train_idx, valid_idx) in enumerate(folds, start=1):
        if group_cv and set(groups[train_idx]) & set(groups[valid_idx]):
            raise ValueError(f"Fold {fold_index} leaks repository groups.")
        model = _forest(42).fit(x.iloc[train_idx], y[train_idx])
        prediction = model.predict(x.iloc[valid_idx])
        probability = _positive_probability(model, x.iloc[valid_idx])
        if oof_seen[valid_idx].any():
            raise ValueError("A training row appears in multiple validation folds.")
        oof_seen[valid_idx] = True
        oof_pred[valid_idx], oof_prob[valid_idx] = prediction, probability
        fold_rows.append({"fold": fold_index, "metrics": _score(y[valid_idx], prediction, probability)})
    if not oof_seen.all():
        raise ValueError("The configured group CV did not produce one prediction for every training row.")

    oof_predictions = []
    for idx, row in train.iterrows():
        outcome = "false_positive" if y[idx] == 0 and oof_pred[idx] == 1 else "false_negative" if y[idx] == 1 and oof_pred[idx] == 0 else "correct"
        oof_predictions.append({**_row_identity(row), "actual_label": int(y[idx]), "predicted_label": int(oof_pred[idx]), "conflict_probability": float(oof_prob[idx]), "error_type": outcome})

    holdout_model = _forest(42).fit(frame.iloc[split.train_indices][list(MODEL_FEATURES)], frame.iloc[split.train_indices][TARGET_COLUMN].to_numpy())
    holdout = frame.iloc[split.test_indices]
    holdout_x = holdout[list(MODEL_FEATURES)]
    holdout_y = holdout[TARGET_COLUMN].to_numpy()
    holdout_pred = holdout_model.predict(holdout_x)
    holdout_prob = _positive_probability(holdout_model, holdout_x)
    holdout_rows = []
    for position, (_, row) in enumerate(holdout.iterrows()):
        actual, predicted = int(holdout_y[position]), int(holdout_pred[position])
        error = "false_positive" if actual == 0 and predicted == 1 else "false_negative" if actual == 1 and predicted == 0 else "correct"
        holdout_rows.append({**_row_identity(row), "actual_label": actual, "predicted_label": predicted, "conflict_probability": float(holdout_prob[position]), "error_type": error})

    seed_results = []
    for seed in SEED_SET:
        predictions = np.empty(len(train), dtype=int)
        probabilities = np.empty(len(train), dtype=float)
        for train_idx, valid_idx in folds:
            model = _forest(seed).fit(x.iloc[train_idx], y[train_idx])
            predictions[valid_idx] = model.predict(x.iloc[valid_idx])
            probabilities[valid_idx] = _positive_probability(model, x.iloc[valid_idx])
        seed_results.append({"seed": seed, "pooled_oof_metrics": _score(y, predictions, probabilities)})

    permutation = _importance(frame, split, folds)
    return {
        "report_type": "exploratory_model_robustness",
        "production_ready": False,
        "artifact_model_name": bundle["model_name"],
        "processed_dataset_sha256": digest,
        "dataset_rows": len(frame),
        "repository_group_count": int(frame["repo_fingerprint"].nunique()),
        "model_features": list(MODEL_FEATURES),
        "api_feature_count": len(bundle["api_feature_names"]),
        "excluded_api_features_remain_excluded": True,
        "split_method": split.method,
        "cv_method": cv_method,
        "holdout_metrics": _score(holdout_y, holdout_pred, holdout_prob),
        "holdout_predictions_and_errors": holdout_rows,
        "group_cv_fold_metrics": fold_rows,
        "group_cv_oof_metrics": _score(y, oof_pred, oof_prob),
        "group_cv_oof_predictions_and_errors": oof_predictions,
        "random_forest_seed_stability": {
            "seeds": seed_results,
            "protocol": "Same fixed repository-group CV folds and unchanged RF parameters for every seed; no repeated holdout and no tuning.",
        },
        "permutation_importance": permutation,
        "comparison_with_stage7a": {
            "reference_report_path": "ml/reports/merge_conflict_model_evaluation.json",
            "reference_report_sha256": hashlib.sha256(Path("ml/reports/merge_conflict_model_evaluation.json").read_bytes()).hexdigest(),
            "reference_holdout_metrics": bundle["evaluation"].get("held_out_metrics"),
            "reference_oof_metrics": bundle["evaluation"]["candidate_models"]["random_forest"]["cross_validation"]["out_of_fold_metrics"],
            "note": "The analysis reuses the saved Stage 7A split policy and model configuration; metrics describe a small exploratory dataset.",
        },
        "limitations": [
            "Only ten repository groups and twenty rows are available; estimates are highly uncertain.",
            "Cross-validation uses small validation folds, including single-class folds.",
            "Out-of-fold probabilities from independently fitted folds are not calibrated probabilities.",
            "Permutation importance is descriptive, noisy, and not a causal feature effect.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="ml/data/processed/merge_examples.csv")
    parser.add_argument("--model", default="ml/models/exploratory/merge_conflict_exploratory_model.joblib")
    parser.add_argument("--output", default="ml/reports/merge_conflict_model_robustness.json")
    args = parser.parse_args()
    report = build_robustness_report(args.dataset, args.model)
    output = Path(args.output)
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing robustness report: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
