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
