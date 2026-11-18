"""Conservative, repository-aware baseline evaluation and training."""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.data.validate import validate_csv, validate_frame
from ml.features import FEATURE_NAMES, MODEL_FEATURES, TARGET_COLUMN

RANDOM_SEED = 42
MINIMUM_ROWS = 20
MINIMUM_PER_CLASS = 5
BUNDLE_VERSION = 2


class DatasetNotTrainable(ValueError):
    """Dataset is not sufficient for a leakage-conscious baseline evaluation."""


@dataclass(frozen=True)
class Split:
    train_indices: np.ndarray
    test_indices: np.ndarray
    method: str
    notes: tuple[str, ...]


def _check_training_readiness(frame: pd.DataFrame) -> None:
    if len(frame) < MINIMUM_ROWS:
        raise DatasetNotTrainable(f"Need at least {MINIMUM_ROWS} labeled examples for this exploratory split; found {len(frame)}.")
    counts = frame[TARGET_COLUMN].value_counts().to_dict()
    if any(counts.get(label, 0) < MINIMUM_PER_CLASS for label in (0, 1)):
        raise DatasetNotTrainable(f"Need at least {MINIMUM_PER_CLASS} examples of each label; found {counts}.")
    entirely_missing = [name for name in MODEL_FEATURES if frame[name].notna().sum() == 0]
    if entirely_missing:
        raise DatasetNotTrainable("These selected baseline features are entirely missing and cannot be learned or imputed: " + ", ".join(entirely_missing))


def make_split(frame: pd.DataFrame) -> Split:
    """Hold out repositories; use a forward-time holdout only for one repo."""
    _check_training_readiness(frame)
    groups = frame["repo_fingerprint"].astype(str).to_numpy()
    labels = frame[TARGET_COLUMN].to_numpy()
    unique_groups = np.unique(groups)
    if len(unique_groups) >= 3:
        splitter = GroupShuffleSplit(n_splits=40, test_size=max(1 / len(unique_groups), 0.2), random_state=RANDOM_SEED)
        for train, test in splitter.split(frame, labels, groups):
            if set(labels[train]) == {0, 1} and set(labels[test]) == {0, 1}:
                if len(np.unique(groups[train])) >= 2:
                    return Split(train, test, "repository_group_holdout", ("No repository appears in both train and test sets.",))
        raise DatasetNotTrainable("Could not form a repository-separated holdout containing both labels in train and test. Add more labeled repositories/examples.")
    if len(unique_groups) == 1:
        if "snapshot_timestamp" not in frame:
            raise DatasetNotTrainable("Single-repository evaluation requires snapshot_timestamp for a forward-time split.")
        times = pd.to_datetime(frame["snapshot_timestamp"], utc=True, errors="coerce")
        if times.isna().any():
            raise DatasetNotTrainable("Single-repository time split requires valid snapshot_timestamp values.")
        ordered = frame.reset_index(drop=True).assign(_time=times.reset_index(drop=True), _row=np.arange(len(frame))).sort_values(["_time", "_row"], kind="stable").index.to_numpy()
        cut = int(len(ordered) * 0.8)
        train, test = ordered[:cut], ordered[cut:]
        if set(labels[train]) != {0, 1} or not set(labels[test]).issubset({0, 1}) or not len(test):
            raise DatasetNotTrainable("The single-repository chronological holdout has inadequate class coverage; collect more time-ordered examples.")
        return Split(train, test, "single_repository_forward_time", ("This only measures later examples from this repository; it does not establish cross-repository generalization.",))
    raise DatasetNotTrainable("Repository-aware evaluation needs at least three repository groups; with one repository, provide a valid chronological holdout. Two repositories are insufficient for this split policy.")


def _make_estimators() -> dict[str, Pipeline]:
    return {
        "dummy_classifier": Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
            ("model", DummyClassifier(strategy="prior", random_state=RANDOM_SEED)),
        ]),
        "logistic_regression": Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
            ("scale", StandardScaler()),
            ("model", LogisticRegression(class_weight="balanced", max_iter=1500, random_state=RANDOM_SEED)),
        ]),
        "random_forest": Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
            ("model", RandomForestClassifier(n_estimators=200, min_samples_leaf=2, class_weight="balanced", random_state=RANDOM_SEED, n_jobs=1)),
        ]),
    }


def _score(y_true: np.ndarray, y_pred: np.ndarray, y_probability: np.ndarray | None = None) -> dict[str, object]:
    positive_support = int(np.sum(y_true == 1))
    positive_predictions = int(np.sum(y_pred == 1))
    has_both_classes = len(np.unique(y_true)) == 2
    undefined: dict[str, str] = {}
    if positive_predictions == 0:
        precision = None
        undefined["precision"] = "No conflict predictions were made in this evaluation set."
    else:
        precision = float(precision_score(y_true, y_pred, zero_division=0))
    if positive_support == 0:
        recall = None
        f1 = None
        undefined["recall"] = "There are no conflict examples in this evaluation set."
        undefined["f1"] = "There are no conflict examples in this evaluation set."
    else:
        recall = float(recall_score(y_true, y_pred, zero_division=0))
        f1 = float(f1_score(y_true, y_pred, zero_division=0))
    if has_both_classes:
        balanced_accuracy = float(balanced_accuracy_score(y_true, y_pred))
    else:
        balanced_accuracy = None
        undefined["balanced_accuracy"] = "Both classes are required for meaningful binary balanced accuracy."

    if has_both_classes and y_probability is not None:
        roc_auc = float(roc_auc_score(y_true, y_probability))
    else:
        roc_auc = None
        undefined["roc_auc"] = "ROC-AUC requires both classes and probability scores in the evaluation set."

    metrics: dict[str, object] = {
        "n_examples": int(len(y_true)),
        "positive_support": positive_support,
        "positive_predictions": positive_predictions,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "balanced_accuracy": balanced_accuracy,
        "confusion_matrix_labels_0_1": confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist(),
        "roc_auc": roc_auc,
        "undefined_metrics": undefined,
    }
    return metrics


def _class_distribution(labels: np.ndarray) -> dict[str, int]:
    return {str(label): int(np.sum(labels == label)) for label in (0, 1) if np.any(labels == label)}


def _fold_layout(
    frame: pd.DataFrame,
    split: Split,
    folds: list[tuple[np.ndarray, np.ndarray]],
) -> list[dict[str, object]]:
    training = frame.iloc[split.train_indices]
    details: list[dict[str, object]] = []
    for index, (train_indices, validation_indices) in enumerate(folds, start=1):
        fold_train = training.iloc[train_indices]
        fold_validation = training.iloc[validation_indices]
        train_groups = set(fold_train["repo_fingerprint"].astype(str))
        validation_groups = set(fold_validation["repo_fingerprint"].astype(str))
        groups_disjoint = not bool(train_groups & validation_groups)
        if split.method == "repository_group_holdout" and not groups_disjoint:
            raise DatasetNotTrainable(f"Cross-validation fold {index} places a repository in both train and validation.")
        details.append({
            "fold": index,
            "train_rows": int(len(fold_train)),
            "validation_rows": int(len(fold_validation)),
            "train_repository_groups": int(len(train_groups)),
            "validation_repository_groups": int(len(validation_groups)),
            "train_class_distribution": _class_distribution(fold_train[TARGET_COLUMN].to_numpy()),
            "validation_class_distribution": _class_distribution(fold_validation[TARGET_COLUMN].to_numpy()),
            "repository_groups_disjoint": groups_disjoint,
        })
    return details


def _cv_splits(frame: pd.DataFrame, split: Split) -> tuple[list[tuple[np.ndarray, np.ndarray]], str]:
    x = frame.iloc[split.train_indices][list(MODEL_FEATURES)]
    y = frame.iloc[split.train_indices][TARGET_COLUMN].to_numpy()
    train_groups = frame.iloc[split.train_indices]["repo_fingerprint"].astype(str).to_numpy()
    distinct_train_groups = np.unique(train_groups)
    if len(distinct_train_groups) >= 2:
        cv = GroupKFold(n_splits=min(5, len(distinct_train_groups)))
        folds = list(cv.split(x, y, train_groups))
        method = "group_k_fold"
    elif split.method == "single_repository_forward_time":
        if len(x) < 12:
            raise DatasetNotTrainable("Not enough training-period examples for time-aware cross-validation.")
        cv = TimeSeriesSplit(n_splits=3)
        folds = list(cv.split(x, y))
        method = "time_series_split"
    else:
        raise DatasetNotTrainable("Not enough independent groups for cross-validation.")
    for fold_number, (train, validation) in enumerate(folds, start=1):
        if set(y[train]) != {0, 1}:
            raise DatasetNotTrainable(f"Cross-validation fold {fold_number} lacks one class in its training portion.")
        missing_in_fold = x.iloc[train].columns[x.iloc[train].notna().sum() == 0].tolist()
        if missing_in_fold:
            raise DatasetNotTrainable(f"Cross-validation fold {fold_number} has entirely missing training features: {', '.join(missing_in_fold)}")
        train_groups = set(frame.iloc[split.train_indices].iloc[train]["repo_fingerprint"].astype(str))
        validation_groups = set(frame.iloc[split.train_indices].iloc[validation]["repo_fingerprint"].astype(str))
        if method == "group_k_fold" and train_groups & validation_groups:
            raise DatasetNotTrainable(f"Cross-validation fold {fold_number} is not repository-group disjoint.")
    return folds, method


def _positive_probability(estimator: Pipeline, values: pd.DataFrame) -> np.ndarray:
    classes = list(estimator.classes_)
    if 1 not in classes:
        raise DatasetNotTrainable("A fitted candidate model has no positive conflict class.")
    return estimator.predict_proba(values)[:, classes.index(1)]


def _evaluate_candidates(
    frame: pd.DataFrame,
    split: Split,
    folds: list[tuple[np.ndarray, np.ndarray]],
    fold_layout: list[dict[str, object]],
) -> dict[str, dict]:
    train = frame.iloc[split.train_indices]
    x = train[list(MODEL_FEATURES)]
    y = train[TARGET_COLUMN].to_numpy()
    evaluations: dict[str, dict] = {}
    metric_names = ("precision", "recall", "f1", "balanced_accuracy", "roc_auc")
    for name in _make_estimators():
        fold_scores: list[dict[str, object]] = []
        out_of_fold_predictions = np.empty(len(y), dtype=int)
        out_of_fold_probabilities = np.empty(len(y), dtype=float)
        evaluated = np.zeros(len(y), dtype=bool)
        for fold_index, (train_fold, valid_fold) in enumerate(folds):
            estimator = _make_estimators()[name]
            estimator.fit(x.iloc[train_fold], y[train_fold])
            validation_values = x.iloc[valid_fold]
            predicted = estimator.predict(validation_values)
            probabilities = _positive_probability(estimator, validation_values)
            if evaluated[valid_fold].any():
                raise DatasetNotTrainable("A training example was used in more than one CV validation fold.")
            evaluated[valid_fold] = True
            out_of_fold_predictions[valid_fold] = predicted
            out_of_fold_probabilities[valid_fold] = probabilities
            fold_scores.append({
                **fold_layout[fold_index],
                "metrics": _score(y[valid_fold], predicted, probabilities),
            })
        if not evaluated.all():
            raise DatasetNotTrainable("Group cross-validation did not produce an out-of-fold prediction for every training row.")
        mean_fold_metrics: dict[str, object] = {}
        defined_folds: dict[str, int] = {}
        for metric in metric_names:
            values = [row["metrics"][metric] for row in fold_scores if row["metrics"][metric] is not None]
            defined_folds[metric] = len(values)
            mean_fold_metrics[metric] = float(np.mean(values)) if values else None
        evaluations[name] = {
            "cross_validation": {
                "fold_metrics": fold_scores,
                "mean_of_defined_fold_metrics": mean_fold_metrics,
                "defined_fold_count_by_metric": defined_folds,
                "out_of_fold_metrics": _score(y, out_of_fold_predictions, out_of_fold_probabilities),
            },
        }
    return evaluations


def evaluate_frame(frame: pd.DataFrame) -> tuple[dict, Pipeline]:
    normalized, report = validate_frame(frame)
    if not report.valid:
        raise DatasetNotTrainable("Dataset validation failed: " + " ".join(report.errors))
    _check_training_readiness(normalized)
    split = make_split(normalized)
    train = normalized.iloc[split.train_indices]
    test = normalized.iloc[split.test_indices]
    train_groups = set(train["repo_fingerprint"].astype(str))
    test_groups = set(test["repo_fingerprint"].astype(str))
    if train_groups & test_groups:
        raise DatasetNotTrainable("The held-out test set is not repository-group disjoint.")
    missing_in_train = [name for name in MODEL_FEATURES if train[name].notna().sum() == 0]
    if missing_in_train:
        raise DatasetNotTrainable("Selected baseline features entirely missing in the training split: " + ", ".join(missing_in_train))

    folds, cv_method = _cv_splits(normalized, split)
    fold_layout = _fold_layout(normalized, split, folds)
    # All fold/group/class checks above complete before any candidate is fitted.
    candidates = _evaluate_candidates(normalized, split, folds, fold_layout)
    # Select using pooled out-of-fold F1 only. Ties prefer the simpler Dummy baseline;
    # the held-out groups are not used for model selection.
    selected_name = max(
        candidates,
        key=lambda name: (
            candidates[name]["cross_validation"]["out_of_fold_metrics"]["f1"]
            if candidates[name]["cross_validation"]["out_of_fold_metrics"]["f1"] is not None
            else -1.0,
            name == "dummy_classifier",
        ),
    )
    held_out_by_model: dict[str, dict[str, object]] = {}
    for name in candidates:
        held_out_estimator = _make_estimators()[name]
        held_out_estimator.fit(train[list(MODEL_FEATURES)], train[TARGET_COLUMN].to_numpy())
        predicted = held_out_estimator.predict(test[list(MODEL_FEATURES)])
        probabilities = _positive_probability(held_out_estimator, test[list(MODEL_FEATURES)])
        held_out_by_model[name] = _score(test[TARGET_COLUMN].to_numpy(), predicted, probabilities)
        candidates[name]["held_out_metrics"] = held_out_by_model[name]

    final_model = _make_estimators()[selected_name]
    final_model.fit(normalized[list(MODEL_FEATURES)], normalized[TARGET_COLUMN].to_numpy())
    class_mapping = {"0": "clean_merge", "1": "merge_conflict"}
    holdout_details = {
        "method": split.method,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "train_repository_groups": int(len(train_groups)),
        "test_repository_groups": int(len(test_groups)),
        "train_class_distribution": _class_distribution(train[TARGET_COLUMN].to_numpy()),
        "test_class_distribution": _class_distribution(test[TARGET_COLUMN].to_numpy()),
        "repository_groups_disjoint": True,
    }
    cross_validation_details = {
        "method": cv_method,
        "fold_count": len(folds),
        "fold_layout": fold_layout,
        "selection_rule": "Highest pooled out-of-fold F1; ties prefer DummyClassifier. Held-out groups are not used for selection.",
    }
    report_data = {
        "dataset_rows": len(normalized),
        "class_distribution": {str(label): int(count) for label, count in normalized[TARGET_COLUMN].value_counts().sort_index().items()},
        "split_method": split.method,
        "cv_method": cv_method,
        "train_rows": len(train),
        "test_rows": len(test),
        "train_class_distribution": {str(label): int(count) for label, count in train[TARGET_COLUMN].value_counts().sort_index().items()},
        "test_class_distribution": {str(label): int(count) for label, count in test[TARGET_COLUMN].value_counts().sort_index().items()},
        "holdout_details": holdout_details,
        "cross_validation_details": cross_validation_details,
        "metric_aggregation_notes": {
            "cross_validation": "Fold metrics retain their own sample counts. Mean fold metrics average only folds where a metric is defined; pooled out-of-fold metrics contain one prediction per training row.",
            "roc_auc": "Pooled out-of-fold ROC-AUC combines scores from separately fitted fold models; interpret alongside per-fold ROC-AUC and sample counts.",
        },
        "candidate_models": candidates,
        "selected_model": selected_name,
        "selected_model_explanation": {
            "dummy_classifier": "Predicts the training-fold class prior and ignores Git feature relationships; it is the reference baseline.",
            "logistic_regression": "Uses median-imputed and standardized Git measurements with a weighted linear decision boundary.",
            "random_forest": "Uses median-imputed Git measurements in 200 randomized decision trees with at least two samples per leaf.",
        }[selected_name],
        "model_features": list(MODEL_FEATURES),
        "excluded_api_features": [name for name in FEATURE_NAMES if name not in MODEL_FEATURES],
        "model_strategy": "Initial five-feature Git metadata baseline; API contract remains 18 fields.",
        "class_mapping": class_mapping,
        "held_out_metrics_by_model": held_out_by_model,
        "held_out_metrics": held_out_by_model[selected_name],
        "split_notes": list(split.notes),
        "missing_feature_counts": report.missing_by_feature,
        "interpretation": "Exploratory repository/time-held-out metrics only; they do not establish production readiness or calibrated probabilities.",
        "production_ready": False,
    }
    return report_data, final_model


def train_csv(dataset_path: str | Path, model_path: str | Path, report_path: str | Path) -> dict:
    model_output = Path(model_path)
    report_output = Path(report_path)
    existing = [str(path) for path in (model_output, report_output) if path.exists()]
    if existing:
        raise FileExistsError("Refusing to overwrite existing model/report artifact(s): " + ", ".join(existing))
    frame, validation = validate_csv(dataset_path)
    if not validation.valid:
        raise DatasetNotTrainable("Dataset validation failed: " + " ".join(validation.errors))
    report, model = evaluate_frame(frame)
    dataset_digest = hashlib.sha256()
    with Path(dataset_path).open("rb") as dataset_file:
        for chunk in iter(lambda: dataset_file.read(1024 * 1024), b""):
            dataset_digest.update(chunk)
    report.update({
        "dataset_sha256": dataset_digest.hexdigest(),
        "repository_group_count": int(frame["repo_fingerprint"].nunique()),
        "random_seed": RANDOM_SEED,
        "scikit_learn_version": sklearn.__version__,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "artifact_type": "exploratory",
        "production_ready": False,
    })
    model_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "bundle_version": BUNDLE_VERSION,
        "feature_names": list(MODEL_FEATURES),
        "api_feature_names": list(FEATURE_NAMES),
        "target_column": TARGET_COLUMN,
        "class_mapping": report["class_mapping"],
        "model_name": report["selected_model"],
        "artifact_type": "exploratory",
        "production_ready": False,
        "random_seed": RANDOM_SEED,
        "dataset_sha256": report["dataset_sha256"],
        "validation_strategy": report["cross_validation_details"],
        "estimator": model,
        "evaluation": report,
    }
    joblib.dump(bundle, model_output)
    report_output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
