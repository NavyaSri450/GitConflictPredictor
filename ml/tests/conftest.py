from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from ml.features import DATASET_COLUMNS, FEATURE_NAMES, INTEGER_FEATURES


@pytest.fixture
def test_fixture_frame() -> pd.DataFrame:
    """Small artificial unit fixture, not a training dataset or Git history."""
    rows = []
    base_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
    for index in range(60):
        label = index % 2
        repository_number = index // 20
        row = {}
        for feature_index, name in enumerate(FEATURE_NAMES):
            if name in {"commit_severity", "coverage", "dependency_risk", "pattern_risk"}:
                row[name] = ((index + feature_index) % 9) / 10
            elif name in INTEGER_FEATURES:
                row[name] = (index + feature_index) % 11
            else:
                row[name] = float((index + feature_index) % 11) + 0.5
        row.update({
            "merge_conflict": label,
            "repo_fingerprint": f"test-repository-{repository_number}",
            "source_ref": f"test/source-{index}",
            "target_ref": "test/target",
            "base_commit": f"{repository_number + 1:040x}",
            "source_commit": f"{index + 10:040x}",
            "target_commit": f"{index + 100:040x}",
            "snapshot_timestamp": (base_time + timedelta(days=index)).isoformat(),
            "collected_at": (base_time + timedelta(days=index, hours=1)).isoformat(),
            "git_version": "test-fixture-only",
            "label_method": "test_fixture_only",
            "collector_version": "test-fixture-only",
        })
        rows.append(row)
    return pd.DataFrame(rows, columns=DATASET_COLUMNS)

