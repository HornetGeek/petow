#!/usr/bin/env python3
"""Capture and compare core model counts via docker compose backend service."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

TARGET_MODELS: List[str] = [
    "accounts.User",
    "accounts.AccountVerification",
    "pets.Breed",
    "pets.Pet",
    "pets.BreedingRequest",
    "pets.AdoptionRequest",
    "pets.Notification",
    "pets.ChatRoom",
    "clinics.Clinic",
    "clinics.ClinicStaff",
    "clinics.ClinicService",
    "clinics.ClinicProduct",
    "clinics.StorefrontOrder",
    "clinics.StorefrontBooking",
    "authtoken.Token",
    "auth.Group",
    "auth.Permission",
    "contenttypes.ContentType",
    "sites.Site",
]

START_MARKER = "SYNC_COUNTS_JSON_START"
END_MARKER = "SYNC_COUNTS_JSON_END"


def detect_compose_bin() -> List[str]:
    docker_compose = subprocess.run(
        ["docker", "compose", "version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if docker_compose.returncode == 0:
        return ["docker", "compose"]

    legacy = subprocess.run(
        ["docker-compose", "version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if legacy.returncode == 0:
        return ["docker-compose"]

    raise RuntimeError("Neither 'docker compose' nor 'docker-compose' is available.")


def build_count_code() -> str:
    return (
        "import json;"
        "from django.apps import apps;"
        f"targets={TARGET_MODELS!r};"
        "out={target: apps.get_model(*target.split('.')).objects.count() for target in targets};"
        f"print('{START_MARKER}');"
        "print(json.dumps(out, sort_keys=True));"
        f"print('{END_MARKER}')"
    )


def fetch_counts(compose_bin: List[str], compose_file: str, service: str) -> Dict[str, int]:
    command = [
        *compose_bin,
        "-f",
        compose_file,
        "exec",
        "-T",
        service,
        "python",
        "manage.py",
        "shell",
        "-c",
        build_count_code(),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Failed to fetch counts from service '{service}'.\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )

    output = result.stdout
    match = re.search(
        rf"{START_MARKER}\s*(\{{.*?\}})\s*{END_MARKER}",
        output,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError(
            "Could not parse count JSON from command output.\n"
            f"Expected markers {START_MARKER}/{END_MARKER}.\n"
            f"Raw output:\n{output}"
        )

    parsed = json.loads(match.group(1))
    if not isinstance(parsed, dict):
        raise RuntimeError("Parsed counts payload is not a JSON object.")
    return {str(k): int(v) for k, v in parsed.items()}


def compare_counts(current: Dict[str, int], expected: Dict[str, int]) -> List[str]:
    mismatches: List[str] = []
    all_keys = sorted(set(current.keys()) | set(expected.keys()))
    for key in all_keys:
        curr = current.get(key)
        exp = expected.get(key)
        if curr != exp:
            mismatches.append(f"{key}: current={curr} expected={exp}")
    return mismatches


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture/compare core Django model counts via docker compose.")
    parser.add_argument("--compose-file", default="docker-compose.yml", help="Compose file path.")
    parser.add_argument("--service", default="backend", help="Compose backend service name.")
    parser.add_argument("--output", help="Optional output JSON file path for captured counts.")
    parser.add_argument("--compare", help="Optional reference JSON file to compare against.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    compose_bin = detect_compose_bin()
    counts = fetch_counts(compose_bin, args.compose_file, args.service)

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(counts, indent=2, sort_keys=True), encoding="utf-8")
        print(f"Wrote counts to {output_path}")

    if args.compare:
        compare_path = Path(args.compare)
        if not compare_path.exists():
            raise RuntimeError(f"Reference counts file not found: {compare_path}")
        expected = json.loads(compare_path.read_text(encoding="utf-8"))
        if not isinstance(expected, dict):
            raise RuntimeError(f"Reference file must contain a JSON object: {compare_path}")
        expected_counts = {str(k): int(v) for k, v in expected.items()}
        mismatches = compare_counts(counts, expected_counts)
        if mismatches:
            print("Count mismatches detected:")
            for line in mismatches:
                print(f"  - {line}")
            return 1
        print("Counts match reference.")

    if not args.output and not args.compare:
        print(json.dumps(counts, indent=2, sort_keys=True))

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
