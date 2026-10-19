"""Private evidence adapters. No public bucket or filesystem route is exposed."""

from pathlib import Path

from app.config import get_settings


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return path

    def put(self, key: str, data: bytes, media_type: str):
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as target:
            target.write(data)

    def get(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def delete(self, key: str):
        self.path(key).unlink(missing_ok=True)


class S3Storage:
    def __init__(self):
        import boto3

        settings = get_settings()
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3", endpoint_url=settings.s3_endpoint_url, region_name=settings.s3_region
        )

    def put(self, key: str, data: bytes, media_type: str):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=media_type)

    def get(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        with response["Body"] as body:
            return body.read()

    def delete(self, key: str):
        self.client.delete_object(Bucket=self.bucket, Key=key)


def get_storage():
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalStorage(settings.local_storage_path)
    if settings.storage_backend == "s3":
        return S3Storage()
    raise ValueError("GG_STORAGE_BACKEND must be local or s3")
