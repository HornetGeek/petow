from storages.backends.s3boto3 import S3Boto3Storage


class HetznerMediaStorage(S3Boto3Storage):
    """S3-compatible media storage for Hetzner Object Storage."""

    location = ""
    default_acl = "public-read"
    file_overwrite = False
    querystring_auth = False
