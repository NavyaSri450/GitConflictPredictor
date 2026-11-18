"""Read the existing evaluation report without exposing its local path."""

import json

from fastapi import HTTPException

from app.core.config import settings
from app.schemas.evaluation import ModelEvaluationResponse


def get_model_evaluation() -> ModelEvaluationResponse:
    report_path = settings.project_root / "ml" / "reports" / "merge_conflict_model_evaluation.json"
    if not report_path.is_file():
        raise HTTPException(status_code=503, detail="The model evaluation report is unavailable.")
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        metrics = report["held_out_metrics"]
        matrix = metrics["confusion_matrix_labels_0_1"]
        if not isinstance(matrix, list) or len(matrix) != 2 or any(not isinstance(row, list) or len(row) != 2 for row in matrix):
            raise ValueError("Invalid confusion matrix.")
        return ModelEvaluationResponse(
            status="available",
            model_name=str(report["selected_model"]),
            artifact_type=str(report["artifact_type"]),
            production_ready=bool(report["production_ready"]),
            trained_at_utc=report.get("trained_at_utc"),
            dataset_rows=int(report["dataset_rows"]),
            repository_group_count=int(report["repository_group_count"]),
            split_method=str(report["split_method"]),
            test_rows=int(metrics["n_examples"]),
            precision=metrics.get("precision"),
            recall=metrics.get("recall"),
            f1=metrics.get("f1"),
            roc_auc=metrics.get("roc_auc"),
            confusion_matrix=[[int(value) for value in row] for row in matrix],
        )
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=503, detail="The model evaluation report failed validation.") from error
