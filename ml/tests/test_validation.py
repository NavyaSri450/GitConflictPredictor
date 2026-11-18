import numpy as np

from ml.data.validate import validate_csv, validate_frame


def test_validation_preserves_missing_predictors_and_reports_class_counts(test_fixture_frame) -> None:
    test_fixture_frame.loc[0, "activity_score"] = np.nan
    validated, report = validate_frame(test_fixture_frame)

    assert report.valid
    assert report.row_count == 60
    assert report.class_distribution == {0: 30, 1: 30}
    assert report.missing_by_feature["activity_score"] == 1
    assert np.isnan(validated.loc[0, "activity_score"])
    assert any("raw missing values were preserved" in warning for warning in report.warnings)


def test_validation_rejects_out_of_range_and_non_binary_labels(test_fixture_frame) -> None:
    test_fixture_frame.loc[0, "coverage"] = 1.2
    test_fixture_frame.loc[1, "merge_conflict"] = 2
    _, report = validate_frame(test_fixture_frame)

    assert not report.valid
    assert any("coverage" in error for error in report.errors)
    assert any("only 0 and 1" in error for error in report.errors)


def test_validation_rejects_unreviewed_extra_columns(test_fixture_frame) -> None:
    test_fixture_frame["access_token"] = "must-not-be-copied"
    _, report = validate_frame(test_fixture_frame)

    assert not report.valid
    assert any("Unexpected columns" in error for error in report.errors)


def test_csv_round_trip_preserves_na_like_refs_and_blank_features(tmp_path, test_fixture_frame) -> None:
    test_fixture_frame.loc[0, "source_ref"] = "NA"
    test_fixture_frame.loc[0, "activity_score"] = np.nan
    dataset = tmp_path / "fixture.csv"
    test_fixture_frame.to_csv(dataset, index=False)

    loaded, report = validate_csv(dataset)

    assert report.valid
    assert loaded.loc[0, "source_ref"] == "NA"
    assert np.isnan(loaded.loc[0, "activity_score"])

