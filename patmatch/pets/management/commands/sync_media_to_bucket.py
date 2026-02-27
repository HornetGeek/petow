import json
import mimetypes
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


MAX_UPLOAD_RETRIES = 3


@dataclass
class MediaFileEntry:
    local_path: Path
    key: str
    size: int


@dataclass
class SyncResult:
    status: str
    key: str
    size: int
    error: str = ""


class Command(BaseCommand):
    help = "Sync local MEDIA_ROOT files to Hetzner Object Storage bucket."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="List actions without uploading.")
        parser.add_argument("--workers", type=int, default=8, help="Parallel upload workers (default: 8).")
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            help="Skip upload when object exists with same size.",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Always upload and overwrite objects.",
        )
        parser.add_argument(
            "--report-json",
            type=str,
            default="",
            help="Optional path to write JSON summary report.",
        )
        parser.add_argument(
            "--prefix",
            type=str,
            default="",
            help="Optional object key prefix (e.g. legacy).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Optional max number of files to process.",
        )

    def handle(self, *args, **options):
        workers = max(1, int(options["workers"] or 1))
        skip_existing = bool(options["skip_existing"])
        overwrite = bool(options["overwrite"])
        dry_run = bool(options["dry_run"])
        prefix = self._normalize_prefix(options.get("prefix") or "")
        limit = int(options.get("limit") or 0)
        report_json = (options.get("report_json") or "").strip()

        if skip_existing and overwrite:
            raise CommandError("Choose either --skip-existing or --overwrite, not both.")

        media_root = Path(settings.MEDIA_ROOT)
        if not media_root.exists() or not media_root.is_dir():
            raise CommandError(f"MEDIA_ROOT does not exist or is not a directory: {media_root}")

        s3_client, bucket = self._build_s3_client_from_env()

        entries = self._collect_media_files(media_root, prefix=prefix, limit=limit if limit > 0 else None)
        total_files = len(entries)
        if total_files == 0:
            self.stdout.write(self.style.WARNING("No media files found to process."))
            return

        self.stdout.write(
            f"Starting media sync: files={total_files}, dry_run={dry_run}, workers={workers}, "
            f"skip_existing={skip_existing}, overwrite={overwrite}, bucket={bucket}"
        )

        summary: Dict[str, int] = {
            "scanned": total_files,
            "uploaded": 0,
            "skipped": 0,
            "failed": 0,
            "would_upload": 0,
        }
        failures: List[Dict[str, str]] = []
        started_at = time.time()

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(
                    self._sync_single_file,
                    s3_client,
                    bucket,
                    entry,
                    dry_run,
                    skip_existing,
                    overwrite,
                )
                for entry in entries
            ]

            for index, future in enumerate(as_completed(futures), start=1):
                result: SyncResult = future.result()
                summary[result.status] = summary.get(result.status, 0) + 1
                if result.status == "failed":
                    failures.append({"key": result.key, "error": result.error})

                if index % 100 == 0 or index == total_files:
                    self.stdout.write(
                        f"Progress {index}/{total_files} - uploaded={summary['uploaded']} "
                        f"skipped={summary['skipped']} failed={summary['failed']} "
                        f"would_upload={summary['would_upload']}"
                    )

        elapsed = round(time.time() - started_at, 2)
        report_payload = {
            "bucket": bucket,
            "media_root": str(media_root),
            "prefix": prefix,
            "dry_run": dry_run,
            "skip_existing": skip_existing,
            "overwrite": overwrite,
            "workers": workers,
            "elapsed_seconds": elapsed,
            "summary": summary,
            "failures": failures,
        }

        self.stdout.write(
            self.style.SUCCESS(
                f"Sync finished in {elapsed}s | scanned={summary['scanned']} uploaded={summary['uploaded']} "
                f"skipped={summary['skipped']} failed={summary['failed']} would_upload={summary['would_upload']}"
            )
        )

        if failures:
            self.stdout.write(self.style.WARNING(f"Failed objects: {len(failures)}"))

        if report_json:
            report_path = Path(report_json)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Wrote report: {report_path}"))

        if summary["failed"] > 0:
            raise CommandError(f"Media sync completed with failures: {summary['failed']} object(s) failed.")

    def _build_s3_client_from_env(self):
        endpoint = os.environ.get("HETZNER_S3_ENDPOINT_URL", "").strip()
        region = os.environ.get("HETZNER_S3_REGION", "").strip()
        access_key = os.environ.get("HETZNER_S3_ACCESS_KEY", "").strip()
        secret_key = os.environ.get("HETZNER_S3_SECRET_KEY", "").strip()
        bucket = os.environ.get("HETZNER_MEDIA_BUCKET", "").strip()

        missing = []
        if not endpoint:
            missing.append("HETZNER_S3_ENDPOINT_URL")
        if not region:
            missing.append("HETZNER_S3_REGION")
        if not access_key:
            missing.append("HETZNER_S3_ACCESS_KEY")
        if not secret_key:
            missing.append("HETZNER_S3_SECRET_KEY")
        if not bucket:
            missing.append("HETZNER_MEDIA_BUCKET")
        if missing:
            raise CommandError(f"Missing required Hetzner environment variables: {', '.join(missing)}")

        if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
            endpoint = f"https://{endpoint}"

        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
        )
        return client, bucket

    def _collect_media_files(
        self,
        media_root: Path,
        prefix: str,
        limit: Optional[int] = None,
    ) -> List[MediaFileEntry]:
        files: List[MediaFileEntry] = []
        for file_path in sorted(media_root.rglob("*")):
            if not file_path.is_file():
                continue
            relative = file_path.relative_to(media_root).as_posix()
            key = f"{prefix}/{relative}" if prefix else relative
            files.append(MediaFileEntry(local_path=file_path, key=key, size=file_path.stat().st_size))
            if limit and len(files) >= limit:
                break
        return files

    def _sync_single_file(
        self,
        s3_client,
        bucket: str,
        entry: MediaFileEntry,
        dry_run: bool,
        skip_existing: bool,
        overwrite: bool,
    ) -> SyncResult:
        try:
            if skip_existing:
                remote_size = self._head_object_size(s3_client, bucket, entry.key)
                if remote_size is not None and remote_size == entry.size:
                    return SyncResult(status="skipped", key=entry.key, size=entry.size)

            if dry_run:
                return SyncResult(status="would_upload", key=entry.key, size=entry.size)

            extra_args = {"ACL": "public-read"}
            guessed_type, _ = mimetypes.guess_type(str(entry.local_path))
            if guessed_type:
                extra_args["ContentType"] = guessed_type

            for attempt in range(1, MAX_UPLOAD_RETRIES + 1):
                try:
                    s3_client.upload_file(
                        str(entry.local_path),
                        bucket,
                        entry.key,
                        ExtraArgs=extra_args,
                    )
                    return SyncResult(status="uploaded", key=entry.key, size=entry.size)
                except (ClientError, BotoCoreError) as exc:
                    if attempt >= MAX_UPLOAD_RETRIES:
                        return SyncResult(
                            status="failed",
                            key=entry.key,
                            size=entry.size,
                            error=str(exc),
                        )
                    time.sleep(attempt * 0.75)
        except Exception as exc:
            return SyncResult(status="failed", key=entry.key, size=entry.size, error=str(exc))

        return SyncResult(status="failed", key=entry.key, size=entry.size, error="Unknown upload failure")

    def _head_object_size(self, s3_client, bucket: str, key: str) -> Optional[int]:
        try:
            metadata = s3_client.head_object(Bucket=bucket, Key=key)
            return int(metadata.get("ContentLength") or 0)
        except ClientError as exc:
            error_code = (exc.response or {}).get("Error", {}).get("Code", "")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise

    def _normalize_prefix(self, value: str) -> str:
        return value.strip().strip("/")
