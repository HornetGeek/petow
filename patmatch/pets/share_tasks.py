"""Share-card jobs run on a bounded queue, separate from notification delivery."""
import logging

from celery import shared_task

from .models import PetShareAsset
from .sharing import render_card

logger = logging.getLogger(__name__)


@shared_task(ignore_result=True, name='pets.share_tasks.render_share_asset')
def render_share_asset(asset_id):
    asset = PetShareAsset.objects.select_related('share__pet__owner', 'share__referral_code').filter(pk=asset_id).first()
    if not asset or asset.state == 'ready':
        return
    try:
        render_card(asset)
    except Exception as exc:
        logger.exception('Unable to render share asset %s', asset_id)
        asset.state = 'failed'
        asset.error = type(exc).__name__[:80]
        asset.save(update_fields=['state', 'error'])


@shared_task(ignore_result=True, queue='notifications', name='pets.share_tasks.capture_share_visit')
def capture_share_visit(share_id, pet_id, sharer_id, source):
    """Attribute a deduplicated external view to the sharing owner in PostHog."""
    from django.conf import settings
    import requests

    token = getattr(settings, 'POSTHOG_PROJECT_TOKEN', '')
    if not token:
        return
    properties = {'pet_id': pet_id, 'share_id': share_id, 'source': source}
    events = ('pet_share_link_opened', 'pet_share_profile_viewed') if source == 'web' else ('pet_share_link_opened',)
    for event in events:
        try:
            response = requests.post(
                settings.POSTHOG_CAPTURE_HOST.rstrip('/') + '/capture/',
                json={'api_key': token, 'event': event,
                      'distinct_id': f'user:{sharer_id}', 'properties': properties},
                timeout=3,
            )
            response.raise_for_status()
        except requests.RequestException:
            logger.warning('PostHog share event failed: %s', event, exc_info=True)


@shared_task(ignore_result=True, queue='share_cards', name='pets.share_tasks.prune_share_assets')
def prune_share_assets():
    """Discard only failed renders; published card URLs remain valid."""
    from datetime import timedelta
    from django.utils import timezone
    from .sharing import get_storage

    cutoff = timezone.now() - timedelta(days=30)
    old_assets = PetShareAsset.objects.filter(
        state='failed', created_at__lt=cutoff,
    ).order_by('created_at')[:500]
    storage = get_storage()
    for asset in old_assets:
        if asset.file_key:
            try:
                storage.delete(asset.file_key)
            except Exception:
                logger.warning('Unable to delete old share asset %s', asset.id, exc_info=True)
                continue
        asset.delete()
