import numpy as np

from ml.data.validate import validate_frame
from ml.features import FEATURE_NAMES, MODEL_FEATURES
from ml.predict import load_model_bundle, predict_conflict_probability
from ml.training.pipeline import DatasetNotTrainable, _score, evaluate_frame, make_split, train_csv
from ml.evaluation.robustness import SEED_SET, _forest


def test_group_split_keeps_repositories_disjoint(test_fixture_frame) -> None:
    split = make_split(test_fixture_frame)
    train_repos = set(test_fixture_frame.iloc[split.train_indices]["repo_fingerprint"])
    test_repos = set(test_fixture_frame.iloc[split.test_indices]["repo_fingerprint"])

    assert split.method == "repository_group_holdout"
    assert train_repos.isdisjoint(test_repos)


def test_robustness_forest_preserves_baseline_inputs_and_fixed_seed_policy() -> None:
    estimator = _forest(42)

    assert tuple(estimator.named_steps) == ("imputer", "model")
    assert estimator.named_steps["model"].n_estimators == 200
    assert estimator.named_steps["model"].min_samples_leaf == 2
    assert estimator.named_steps["model"].n_jobs == 1
    assert SEED_SET == (42, 7, 21, 84, 123)


def test_training_pipeline_compares_baselines_and_handles_missing_values(test_fixture_frame) -> None:
    test_fixture_frame.loc[0, "activity_score"] = np.nan
    report, estimator = evaluate_frame(test_fixture_frame)

    expected_models = {"dummy_classifier", "logistic_regression", "random_forest"}
    assert set(report["candidate_models"]) == expected_models
    assert set(report["held_out_metrics_by_model"]) == expected_models
    assert report["split_method"] == "repository_group_holdout"
    assert report["holdout_details"]["repository_groups_disjoint"] is True
    assert report["cross_validation_details"]["fold_count"] == len(report["cross_validation_details"]["fold_layout"])
    for model_report in report["candidate_models"].values():
        cv = model_report["cross_validation"]
        assert len(cv["fold_metrics"]) == report["cross_validation_details"]["fold_count"]
        assert cv["out_of_fold_metrics"]["n_examples"] == report["train_rows"]
        for fold in cv["fold_metrics"]:
            assert fold["repository_groups_disjoint"] is True
            assert fold["metrics"]["n_examples"] == fold["validation_rows"]
            assert "balanced_accuracy" in fold["metrics"]
            assert "confusion_matrix_labels_0_1" in fold["metrics"]
            assert "roc_auc" in fold["metrics"]
        held_out = model_report["held_out_metrics"]
        assert held_out["n_examples"] == report["test_rows"]
        assert "balanced_accuracy" in held_out
        assert "confusion_matrix_labels_0_1" in held_out
    assert report["held_out_metrics"]["precision"] is None or report["held_out_metrics"]["precision"] >= 0
    assert report["held_out_metrics"]["recall"] is None or report["held_out_metrics"]["recall"] >= 0
    assert report["held_out_metrics"]["f1"] is None or report["held_out_metrics"]["f1"] >= 0
    assert estimator is not None


def test_single_class_metrics_explain_undefined_binary_metrics() -> None:
    metrics = _score(
        np.array([0, 0]),
        np.array([0, 0]),
        np.array([0.1, 0.2]),
    )

    assert metrics["n_examples"] == 2
    assert metrics["roc_auc"] is None
    assert metrics["balanced_accuracy"] is None
    assert metrics["recall"] is None
    assert metrics["f1"] is None
    assert "ROC-AUC" in metrics["undefined_metrics"]["roc_auc"]


def test_baseline_uses_only_observed_features_when_other_api_fields_are_missing(test_fixture_frame) -> None:
    excluded = [name for name in FEATURE_NAMES if name not in MODEL_FEATURES]
    test_fixture_frame[excluded] = test_fixture_frame[excluded].astype(float)
    for name in excluded:
        test_fixture_frame[name] = np.full(len(test_fixture_frame), np.nan)

    report, estimator = evaluate_frame(test_fixture_frame)

    assert report["model_features"] == list(MODEL_FEATURES)
    assert report["excluded_api_features"] == excluded
    assert all(report["missing_feature_counts"][name] == len(test_fixture_frame) for name in excluded)
    assert estimator is not None


def test_training_rejects_insufficient_or_single_class_data(test_fixture_frame) -> None:
    _, valid_report = validate_frame(test_fixture_frame.iloc[:12].copy())
    assert valid_report.valid
    try:
        evaluate_frame(test_fixture_frame.iloc[:12].copy())
    except DatasetNotTrainable as error:
        assert "at least 20" in str(error)
    else:
        raise AssertionError("An undersized fixture must not be presented as a trainable dataset.")


def test_model_bundle_round_trip_uses_only_test_fixture_rows(tmp_path, test_fixture_frame) -> None:
    dataset = tmp_path / "test_fixture_only.csv"
    artifact = tmp_path / "test_fixture_model.joblib"
    report_path = tmp_path / "test_fixture_report.json"
    test_fixture_frame.to_csv(dataset, index=False)

    report = train_csv(dataset, artifact, report_path)
    bundle = load_model_bundle(artifact)
    features = {name: test_fixture_frame.iloc[0][name].item() for name in MODEL_FEATURES}
    probability = predict_conflict_probability(bundle, features)

    assert report["selected_model"] in {"dummy_classifier", "logistic_regression", "random_forest"}
    assert bundle["api_feature_names"] == list(FEATURE_NAMES)
    assert bundle["feature_names"] == list(MODEL_FEATURES)
    assert bundle["artifact_type"] == "exploratory"
    assert bundle["production_ready"] is False
    assert bundle["class_mapping"] == {"0": "clean_merge", "1": "merge_conflict"}
    assert bundle["dataset_sha256"] == report["dataset_sha256"]
    assert bundle["random_seed"] == report["random_seed"]
    assert 0 <= probability <= 1
    assert artifact.is_relative_to(tmp_path)

