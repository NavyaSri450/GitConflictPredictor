"""CLI for explicitly requested local-repository merge example collection."""

import argparse
import csv
import sys
from pathlib import Path

from ml.data.git_collection import GitCollectionError, collect_pair
from ml.features import DATASET_COLUMNS


def append_rows(path: Path, rows: list[dict[str, object]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: set[tuple[str, str, str]] = set()
    if path.exists():
        with path.open("r", newline="", encoding="utf-8") as input_file:
            for item in csv.DictReader(input_file):
                existing.add((item.get("repo_fingerprint", ""), item.get("source_commit", ""), item.get("target_commit", "")))
    new_rows: list[dict[str, object]] = []
    for row in rows:
        key = (str(row["repo_fingerprint"]), str(row["source_commit"]), str(row["target_commit"]))
        if key not in existing:
            new_rows.append(row)
            existing.add(key)
    write_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", newline="", encoding="utf-8") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=DATASET_COLUMNS, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerows(new_rows)
    return len(new_rows)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect merge labels from an explicitly supplied local Git repository.")
    parser.add_argument("--repo", required=True, help="Path to an existing local Git working copy; URLs are not accepted.")
    parser.add_argument("--pair", action="append", nargs=2, metavar=("SOURCE", "TARGET"), required=True, help="Source and target branch names or commit IDs. Repeat for more pairs.")
    parser.add_argument("--repository-id", help="Optional stable, non-sensitive alias used to group examples from this repository.")
    parser.add_argument("--output", default="ml/data/raw/merge_examples.csv", help="Raw CSV output path (ignored by Git by default).")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    rows: list[dict[str, object]] = []
    for source_ref, target_ref in args.pair:
        try:
            row = collect_pair(args.repo, source_ref, target_ref, args.repository_id)
        except GitCollectionError as error:
            print(f"Skipped {source_ref} -> {target_ref}: {error}", file=sys.stderr)
            continue
        rows.append(row)
        print(f"Labeled {source_ref} -> {target_ref}: merge_conflict={row['merge_conflict']} (features may be missing).")
    if not rows:
        print("No merge examples were collected; no dataset file was written.", file=sys.stderr)
        return 1
    output = Path(args.output).expanduser().resolve()
    added = append_rows(output, rows)
    print(f"Added {added} new row(s) to {output}. Raw dataset files are ignored by Git.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
