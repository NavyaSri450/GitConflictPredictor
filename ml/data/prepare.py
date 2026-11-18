"""Validate and copy raw rows to a separately stored curated dataset.

This step does not fill missing values, synthesize examples, or alter the raw
source. Model-time imputation is fit only inside cross-validation/training folds.
"""

import argparse
from pathlib import Path
import sys

from ml.data.validate import validate_csv


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a raw merge dataset and copy it to the processed area without imputation.")
    parser.add_argument("--input", default="ml/data/raw/merge_examples.csv")
    parser.add_argument("--output", default="ml/data/processed/merge_examples.csv")
    args = parser.parse_args(argv)
    try:
        frame, report = validate_csv(args.input)
    except FileNotFoundError as error:
        print(f"Preparation stopped: {error}. Collect local merge examples first.", file=sys.stderr)
        return 2
    if not report.valid:
        for error in report.errors:
            print(f"ERROR: {error}")
        return 2
    for warning in report.warnings:
        print(f"WARNING: {warning}")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False)
    print(f"Validated {report.row_count} row(s); copied unchanged feature values to {output}.")
    print(f"Class distribution: {report.class_distribution}.")
    print(f"Repository groups: {report.repository_group_count}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
