from django.apps import AppConfig


class ClinicsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'clinics'

    def ready(self):
        # Import signal handlers to wire invite auto-claim logic
        from . import signals  # noqa: F401
