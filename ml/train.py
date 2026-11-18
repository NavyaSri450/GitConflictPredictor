"""Train and compare lightweight baseline models from a validated dataset."""

import argparse
import json
import sys

from ml.training.pipeline import DatasetNotTrainable, train_csv


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="ml/data/processed/merge_examples.csv")
    parser.add_argument("--model-output", default="ml/models/exploratory/merge_conflict_exploratory_model.joblib")
    parser.add_argument("--report-output", default="ml/reports/merge_conflict_model_evaluation.json")
    args = parser.parse_args(argv)
    try:
        report = train_csv(args.dataset, args.model_output, args.report_output)
    except (DatasetNotTrainable, FileNotFoundError, FileExistsError) as error:
        print(f"Training stopped: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    print("Baseline artifact saved. Metrics are exploratory and are not a production-readiness claim.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
