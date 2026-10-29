"""Public pet sharing, deterministic card rendering and referral accounting."""
import hashlib
import hmac
import io
import logging
import os
import re
import textwrap
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db import IntegrityError, models, transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from django.core.paginator import Paginator

from .models import Pet, PetShare, PetShareAsset, PetShareVisit, ReferralCode, ReferralAttribution, PointsWallet, PointsTransaction, EngagementEvent
from .points import points_enabled_for
from .share_rules import SHAREABLE_STATUSES

logger = logging.getLogger(__name__)
FORMATS = {'post': (1080, 1350), 'story': (1080, 1920), 'og': (1200, 630)}
TEMPLATES = {'simple', 'hearts', 'pastel', 'funny', 'cute', 'royal'}
PERSONALITIES = {'funny', 'cute', 'royal'}
RENDER_VERSION = 2
SITE = settings.PETOW_PUBLIC_SITE_URL.rstrip('/')


class PetShareOpenThrottle(AnonRateThrottle):
    scope = 'pet_share_open'


class ReferralWalletThrottle(UserRateThrottle):
    scope = 'referral_wallet'


def shareable(pet):
    return bool(pet and pet.is_public and pet.status in SHAREABLE_STATUSES
                and not pet.discovery_paused_at and pet.main_image
                and pet.owner.is_active)


def valid_share(share):
    return bool(share and share.pet_owner_id_at_share == share.pet.owner_id
                and shareable(share.pet))


def revision_for(pet):
    value = '|'.join(str(x) for x in (
        RENDER_VERSION, pet.pk, pet.owner_id, pet.updated_at, pet.status, pet.is_public,
        pet.discovery_paused_at, pet.main_image.name))
    return hashlib.sha256(value.encode()).hexdigest()


def safe_pet(pet):
    return {
        'id': pet.id, 'name': pet.name, 'pet_type': pet.pet_type,
        'breed_name': pet.breed.name, 'age_months': pet.age_months,
        'age_display': pet.age_display, 'gender': pet.gender,
        'status': pet.status, 'main_image': pet.main_image.url,
    }


def share_url(share):
    return f'{SITE}/p/{share.pet_id}?' + urlencode({
        'ref': share.referral_code.code, 's': str(share.id)})


def asset_url(request, asset):
    return request.build_absolute_uri(f'/api/pets/share-assets/{asset.id}/')


def asset_data(request, asset):
    return {
        'id': str(asset.id), 'format': asset.format, 'template': asset.template,
        'state': asset.state, 'url': asset_url(request, asset) if asset.state == 'ready' else None,
    }


def share_data(request, share):
    current = revision_for(share.pet)
    assets = [asset_data(request, a) for a in share.assets.all()
              if a.revision == current]
    return {'id': str(share.id), 'url': share_url(share),
            'pet': safe_pet(share.pet), 'assets': assets}


def get_storage():
    if settings.USE_HETZNER_OBJECT_STORAGE:
        from storages.backends.s3boto3 import S3Boto3Storage
        return S3Boto3Storage(location='share_cards_private', default_acl='private',
                              querystring_auth=True, file_overwrite=False)
    return FileSystemStorage(location=settings.BASE_DIR / 'private_share_media',
                             base_url=None)


def _font(size):
    from PIL import ImageFont
    paths = [
        os.path.join(settings.BASE_DIR, 'pets', 'fonts', 'Cairo-Bold.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for path in paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise RuntimeError('No Arabic-capable share card font is installed')


def _rtl(draw, xy, value, font, fill, anchor='ra'):
    draw.text(xy, value, font=font, fill=fill, direction='rtl', anchor=anchor)


def render_card(asset):
    from PIL import Image, ImageDraw, ImageOps, features
    import qrcode

    if not features.check_feature('raqm'):
        raise RuntimeError('Pillow was built without Arabic text shaping')
    pet = Pet.objects.select_related('breed', 'owner').get(pk=asset.share.pet_id)
    if not shareable(pet) or asset.revision != revision_for(pet):
        raise RuntimeError('Pet is no longer public or the card is stale')
    if str(pet.main_image.name).startswith(('http://', 'https://')):
        raise RuntimeError('External legacy image must be migrated before rendering')

    if asset.template in PERSONALITIES and asset.format != 'og':
        from .share_personalities import render_personality
        out = render_personality(pet, share_url(asset.share), asset.format,
                                 asset.template, asset.caption)
        current = Pet.objects.select_related('owner').get(pk=pet.pk)
        if not shareable(current) or asset.revision != revision_for(current):
            raise RuntimeError('Pet changed while rendering')
        path = get_storage().save(
            f'{asset.share_id}/{asset.id}.jpg', ContentFile(out.read()))
        asset.file_key = path
        asset.state = 'ready'
        asset.error = ''
        asset.save(update_fields=['file_key', 'state', 'error'])
        return

    if asset.template == 'pastel' and asset.format != 'og':
        from .share_pastel import render_pastel
        out = render_pastel(pet, share_url(asset.share), asset.format)
        current = Pet.objects.select_related('owner').get(pk=pet.pk)
        if not shareable(current) or asset.revision != revision_for(current):
            raise RuntimeError('Pet changed while rendering')
        path = get_storage().save(
            f'{asset.share_id}/{asset.id}.jpg', ContentFile(out.read()))
        asset.file_key = path
        asset.state = 'ready'
        asset.error = ''
        asset.save(update_fields=['file_key', 'state', 'error'])
        return

    width, height = FORMATS[asset.format]
    with pet.main_image.open('rb') as source:
        photo = Image.open(source)
        # Pillow 9.5 (pinned in requirements.txt) has no in_place argument; it returns a new image.
        photo = ImageOps.exif_transpose(photo)
        photo = photo.convert('RGB')
        if photo.width * photo.height > 40_000_000:
            raise RuntimeError('Image exceeds decode limit')

        canvas = Image.new('RGB', (width, height), '#e6f6f3')
        if asset.format == 'og':
            image_box = (0, 0, 640, height)
            panel = (640, 0, width, height)
        else:
            photo_height = int(height * (0.70 if asset.format == 'post' else 0.74))
            image_box = (0, 0, width, photo_height)
            panel = (0, photo_height, width, height)

        box_w = image_box[2] - image_box[0]
        box_h = image_box[3] - image_box[1]
        background = ImageOps.fit(photo, (box_w, box_h))
        canvas.paste(background, (image_box[0], image_box[1]))
        contained = ImageOps.contain(photo, (box_w, box_h))
        canvas.paste(contained, (image_box[0] + (box_w - contained.width)//2,
                                  image_box[1] + (box_h - contained.height)//2))

    draw = ImageDraw.Draw(canvas)
    teal = '#13aaa5'
    ink = '#101828'
    draw.rectangle(panel, fill='#ffffff')
    if asset.template == 'hearts':
        draw.ellipse((width-110, panel[1]+20, width-65, panel[1]+65), fill='#ff6b83')
        draw.ellipse((width-170, panel[1]+40, width-140, panel[1]+70), fill='#d8f3ef')
    left = panel[0] + 48
    right = panel[2] - 48
    top = panel[1] + 44
    purpose = 'للتبني' if pet.status == 'available_for_adoption' else 'للتزاوج'
    headline = (
        f'{pet.name} بتدور على بيت جديد' if pet.gender == 'F'
        else f'{pet.name} بيدور على بيت جديد'
    ) if pet.status == 'available_for_adoption' else 'بدور على شريك مناسب'
    draw.rounded_rectangle((right-210, top, right, top+60), radius=28, fill=teal)
    _rtl(draw, (right-25, top+9), purpose, _font(30), '#ffffff')
    name_y = top + (100 if asset.format == 'og' else 90)
    _rtl(draw, (right, name_y), pet.name[:35], _font(54 if asset.format != 'og' else 42), ink)
    # The QR code sits in the bottom-right corner of post/story, so keep text clear of it.
    text_right = right - 210 if asset.format != 'og' else right
    _rtl(draw, (text_right, name_y+75), headline[:45], _font(32 if asset.format != 'og' else 26), teal)
    facts = ' • '.join(x for x in (pet.breed.name if pet.breed else None, pet.age_display,
                                   'أنثى' if pet.gender == 'F' else 'ذكر') if x)
    _rtl(draw, (text_right, name_y+140), facts[:68], _font(26 if asset.format != 'og' else 20), '#475467')
    brand_y = panel[3] - 125
    draw.text((left, brand_y), 'Petow', font=_font(48 if asset.format != 'og' else 35), fill=teal)
    if asset.format != 'og':
        code = qrcode.QRCode(box_size=6, border=4)
        code.add_data(share_url(asset.share))
        code.make(fit=True)
        qr = code.make_image(fill_color='#101828', back_color='white').convert('RGB')
        qr.thumbnail((190, 190))
        canvas.paste(qr, (right-190, panel[3]-200))
        _rtl(draw, (right-220, name_y+190), 'شوف التفاصيل على Petow', _font(24), ink)
    out = io.BytesIO()
    canvas.save(out, format='JPEG', quality=84, optimize=True, progressive=True)
    out.seek(0)

    # Publish only if no edit or availability change happened during rendering.
    current = Pet.objects.select_related('owner').get(pk=pet.pk)
    if not shareable(current) or asset.revision != revision_for(current):
        raise RuntimeError('Pet changed while rendering')
    path = get_storage().save(
        f'{asset.share_id}/{asset.id}.jpg', ContentFile(out.read()))
    asset.file_key = path
    asset.state = 'ready'
    asset.error = ''
    asset.save(update_fields=['file_key', 'state', 'error'])


def schedule_asset(asset):
    from .share_tasks import render_share_asset
    transaction.on_commit(lambda: render_share_asset.apply_async(args=[str(asset.id)],
                                                                    queue='share_cards'))


def ensure_asset(share, template, fmt, caption=''):
    revision = revision_for(share.pet)
    content_hash = hashlib.sha256(caption.encode('utf-8')).hexdigest() if caption else ''
    asset, created = PetShareAsset.objects.get_or_create(
        share=share, template=template, format=fmt, revision=revision,
        content_hash=content_hash, defaults={'caption': caption})
    if created or asset.state == 'failed':
        if not created:
            asset.state = 'pending'
            asset.save(update_fields=['state'])
        schedule_asset(asset)
    return asset


@api_view(['GET'])
@permission_classes([AllowAny])
def public_pet(request, pet_id):
    pet = Pet.objects.select_related('breed', 'owner').filter(pk=pet_id).first()
    if not shareable(pet):
        raise Http404
    return Response(safe_pet(pet))


@api_view(['GET'])
@permission_classes([AllowAny])
def public_share(request, pet_id, share_id):
    share = PetShare.objects.select_related(
        'pet__breed', 'pet__owner', 'referral_code'
    ).filter(pk=share_id, pet_id=pet_id, revoked_at__isnull=True).first()
    if not valid_share(share):
        raise Http404
    current = revision_for(share.pet)
    og = share.assets.filter(format='og', state='ready', revision=current).first()
    return Response({
        'pet': safe_pet(share.pet),
        'ref': share.referral_code.code,
        'og_image': asset_url(request, og) if og else None,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PetShareOpenThrottle])
def record_public_share_open(request, pet_id, share_id):
    """Count unique browser visitors without storing IP addresses or raw client tokens."""
    import re
    token = str(request.data.get('visitor_id', ''))
    if not re.fullmatch(r'[A-Za-z0-9-]{16,80}', token):
        return Response({'error': 'Invalid visitor token'}, status=400)
    share = PetShare.objects.select_related('pet__breed', 'pet__owner').filter(
        pk=share_id, pet_id=pet_id, revoked_at__isnull=True).first()
    if not valid_share(share):
        raise Http404
    digest = hmac.new(settings.SECRET_KEY.encode(), token.encode(), hashlib.sha256).hexdigest()
    _visit, created = PetShareVisit.objects.get_or_create(share=share, visitor_digest=digest)
    if created:
        try:
            from .share_tasks import capture_share_visit
            capture_share_visit.delay(str(share.id), share.pet_id, share.sharer_id,
                                      'app_link' if request.data.get('source') == 'app_link' else 'web')
        except Exception:
            logger.warning('Unable to queue share visit analytics', exc_info=True)
    return Response({'recorded': created}, status=201 if created else 200)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def claim_referral_view(request):
    code = str(request.data.get('ref', ''))[:16]
    share_id = request.data.get('share_id')
    if share_id:
        try:
            import uuid
            share_id = uuid.UUID(str(share_id))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid share'}, status=400)
    attribution = claim_referral(
        request.user, code, share_id,
        str(request.data.get('source', 'app_link'))[:20],
    )
    if not attribution:
        return Response({'error': 'Referral is not eligible'}, status=400)
    return Response({'attributed': True, 'status': attribution.status})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def referral_summary(request):
    wallet = PointsWallet.objects.filter(user=request.user).first()
    referrals = ReferralAttribution.objects.filter(referrer=request.user)
    shares = PetShare.objects.filter(sharer=request.user)
    mature = referrals.filter(captured_at__lte=timezone.now() - timedelta(days=30))
    returned = EngagementEvent.objects.filter(
        user_id=models.OuterRef('referred_user_id'),
        created_at__gte=models.OuterRef('captured_at') + timedelta(days=30),
        created_at__lt=models.OuterRef('captured_at') + timedelta(days=60),
    )
    return Response({
        'link_visits': PetShareVisit.objects.filter(share__in=shares).count(),
        'attributed_signups': referrals.count(),
        'pending_count': referrals.filter(status='pending').count(),
        'qualified_count': referrals.filter(status='qualified').count(),
        'rejected_count': referrals.filter(status='rejected').count(),
        'retention_30d_eligible': mature.count(),
        'retained_30d': mature.annotate(returned=models.Exists(returned)).filter(returned=True).count(),
        'points_enabled': points_enabled_for(request.user.pk),
        'points_per_signup': 0,
        'points_per_qualified_referral': 1 if points_enabled_for(request.user.pk) else 0,
        'balance': wallet.balance if wallet else 0,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([ReferralWalletThrottle])
def referral_wallet(request):
    wallet = PointsWallet.objects.filter(user=request.user).first()
    entries = (PointsTransaction.objects.filter(wallet=wallet).order_by('-created_at', '-pk')
               if wallet else PointsTransaction.objects.none())
    page = Paginator(entries, 20).get_page(request.query_params.get('page', 1))
    return Response({
        'balance': wallet.balance if wallet else 0,
        'points_enabled': points_enabled_for(request.user.pk),
        'points_per_qualified_referral': 1 if points_enabled_for(request.user.pk) else 0,
        'activity': {
            'count': page.paginator.count,
            'next_page': page.next_page_number() if page.has_next() else None,
            'previous_page': page.previous_page_number() if page.has_previous() else None,
            'results': [
                {'id': item.pk, 'amount': item.amount, 'reason': item.reason,
                 'created_at': item.created_at.isoformat()}
                for item in page.object_list
            ],
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_share(request, pet_id):
    pet = Pet.objects.select_related('breed', 'owner').filter(pk=pet_id).first()
    if not shareable(pet):
        raise Http404
    mode = request.data.get('mode', 'card')
    if mode not in {'card', 'link'}:
        return Response({'error': 'Invalid share mode'}, status=400)
    template = request.data.get('template', 'simple')
    if mode == 'card' and template not in TEMPLATES:
        return Response({'error': 'Unsupported card design'}, status=400)
    if mode == 'card' and pet.owner_id != request.user.id:
        return Response({'error': 'Only the owner can generate a card'}, status=403)
    key = str(request.data.get('idempotency_key', ''))[:64]
    if not key or len(key) < 8:
        return Response({'error': 'Missing idempotency key'}, status=400)
    code, _ = ReferralCode.objects.get_or_create(user=request.user)
    existing_key = PetShare.objects.filter(sharer=request.user, idempotency_key=key).first()
    if existing_key and existing_key.pet_id != pet.id:
        return Response({'error': 'Key belongs to another pet'}, status=409)
    share, created = PetShare.objects.get_or_create(
        sharer=request.user, pet=pet,
        defaults={'pet': pet, 'pet_owner_id_at_share': pet.owner_id,
                  'referral_code': code, 'idempotency_key': key,
                  'entry_point': str(request.data.get('entry_point', 'pet_details'))[:32]})
    if share.pet_owner_id_at_share != pet.owner_id or share.revoked_at:
        share.pet_owner_id_at_share = pet.owner_id
        share.revoked_at = None
        share.save(update_fields=['pet_owner_id_at_share', 'revoked_at'])
    if mode == 'card':
        ensure_asset(share, template, 'post')
    ensure_asset(share, 'simple', 'og')
    return Response(share_data(request, share), status=201 if created else 200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def share_status(request, pet_id, share_id):
    share = PetShare.objects.select_related('pet__breed', 'pet__owner', 'referral_code').filter(
        pk=share_id, pet_id=pet_id, sharer=request.user).first()
    if not valid_share(share) or share.revoked_at:
        raise Http404
    return Response(share_data(request, share))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_asset(request, pet_id, share_id):
    share = PetShare.objects.select_related('pet__breed', 'pet__owner', 'referral_code').filter(
        pk=share_id, pet_id=pet_id, sharer=request.user).first()
    if not valid_share(share) or share.pet.owner_id != request.user.id:
        raise Http404
    template, fmt = request.data.get('template'), request.data.get('format')
    if template not in TEMPLATES or fmt not in {'post', 'story'}:
        return Response({'error': 'Unsupported card design'}, status=400)
    caption = str(request.data.get('caption', '')).strip()
    if template in PERSONALITIES:
        if (len(caption) < 3 or len(caption) > 140 or
                re.search(r'[\x00-\x1f\x7f]|https?://|www\.|@\w+|\+?\d[\d\s().-]{8,}\d', caption, re.I) or
                re.search(r'عنواني|رقمي|تليفوني|واتسابي|اقتل|تعذيب', caption, re.I)):
            return Response({'error': 'Invalid caption'}, status=400)
    else:
        caption = ''
    asset = ensure_asset(share, template, fmt, caption)
    data = share_data(request, share)
    data['selected_asset_id'] = str(asset.id)
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])
def share_asset(request, asset_id):
    asset = PetShareAsset.objects.select_related('share__pet__owner').filter(pk=asset_id).first()
    if not asset or asset.state != 'ready' or asset.share.revoked_at or not valid_share(asset.share):
        raise Http404
    if not shareable(asset.share.pet) or asset.revision != revision_for(asset.share.pet):
        raise Http404
    try:
        response = FileResponse(get_storage().open(asset.file_key, 'rb'), content_type='image/jpeg')
    except (FileNotFoundError, OSError):
        raise Http404
    response['Cache-Control'] = 'public, max-age=60'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


def claim_referral(user, code_value, share_id=None, source='app_link', original_pet_id=None, device_id=None):
    """Capture a new account's referral. Qualification happens on first pet creation."""
    if not code_value or user.date_joined < timezone.now() - timedelta(hours=24):
        return None
    if share_id:
        try:
            import uuid
            share_id = uuid.UUID(str(share_id))
        except (ValueError, TypeError):
            return None
    code = ReferralCode.objects.select_related('user').filter(code=code_value).first()
    if not code or code.user_id == user.id or not code.user.is_active:
        return None
    share = PetShare.objects.filter(pk=share_id, referral_code=code).first() if share_id else None
    if share_id and not share:
        return None
    if share and (share.revoked_at or not valid_share(share)):
        return None
    if original_pet_id is not None:
        try:
            original_pet_id = int(original_pet_id)
        except (TypeError, ValueError):
            return None
        if original_pet_id <= 0 or (share and share.pet_id != original_pet_id):
            return None
    device_digest = None
    if device_id is not None:
        if not isinstance(device_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', device_id):
            return None
        device_digest = hmac.new(settings.SECRET_KEY.encode(),
                                 ('referral-device:' + device_id).encode(), hashlib.sha256).hexdigest()
    valid_sources = {value for value, _label in ReferralAttribution.SOURCE_CHOICES}
    source = source if source in valid_sources else 'app_link'
    digest = hmac.new(settings.SECRET_KEY.encode(), user.email.strip().casefold().encode(),
                      hashlib.sha256).hexdigest()
    try:
        with transaction.atomic():
            attribution, _created = ReferralAttribution.objects.get_or_create(
                referred_user=user,
                defaults={'referrer': code.user, 'share': share, 'source': source,
                          'email_digest': digest,
                          'device_digest': device_digest,
                          'referred_user_id_at_capture': user.pk,
                          'original_pet_id': share.pet_id if share else None})
            if attribution.referrer_id != code.user_id or attribution.share_id != (share.id if share else None):
                return None
            return attribution
    except IntegrityError:
        logger.info('Duplicate referral identity rejected for user %s', user.pk)
        return None


def qualify_referral_for_pet(user, pet):
    """Qualify exactly once after a first, real pet is saved. Never award points here."""
    from accounts.models import PushDevice, User

    with transaction.atomic():
        attribution = (ReferralAttribution.objects.select_for_update()
                       .filter(referred_user=user, status='pending').first())
        if not attribution:
            return None
        now = timezone.now()
        reason = None
        if not user.is_active or not attribution.referrer.is_active:
            reason = 'deleted_account'
        elif user.pk == attribution.referrer_id:
            reason = 'self_referral'
        elif pet.owner_id != user.pk or pet.created_at < attribution.captured_at:
            reason = 'invalid_pet_action'
        elif pet.created_at > attribution.captured_at + timedelta(days=30):
            reason = 'window_expired'
        elif Pet.objects.filter(owner=user, created_at__lt=pet.created_at).exclude(pk=pet.pk).exists():
            reason = 'not_first_pet'
        elif (user.is_phone_verified and user.phone and
              User.objects.filter(is_phone_verified=True, phone=user.phone)
              .exclude(pk=user.pk).exists()):
            reason = 'duplicate_identity'
        elif (attribution.device_digest and ReferralAttribution.objects.filter(
              device_digest=attribution.device_digest).exclude(pk=attribution.pk).exists()):
            reason = 'repeat_device'
        else:
            device_ids = PushDevice.objects.filter(user=user).values('device_id')
            existing_devices = PushDevice.objects.filter(device_id__in=device_ids).exclude(user=user)
            referrer_device_match = (attribution.device_digest and any(
                hmac.compare_digest(
                    hmac.new(settings.SECRET_KEY.encode(),
                             ('referral-device:' + item).encode(), hashlib.sha256).hexdigest(),
                    attribution.device_digest,
                ) for item in PushDevice.objects.filter(user=attribution.referrer)
                .values_list('device_id', flat=True)))
            if existing_devices.exists() or referrer_device_match:
                reason = 'repeat_device'
        if reason:
            attribution.status = 'rejected'
            attribution.rejected_at = now
            attribution.rejection_reason = reason
            attribution.save(update_fields=['status', 'rejected_at', 'rejection_reason'])
            return attribution
        attribution.status = 'qualified'
        attribution.qualified_at = now
        attribution.save(update_fields=['status', 'qualified_at'])
        def queue_analytics():
            try:
                from .share_tasks import capture_referral_qualified
                capture_referral_qualified.delay(attribution.pk)
            except Exception:
                logger.warning('Unable to schedule referral analytics', exc_info=True)
        transaction.on_commit(queue_analytics)
        def queue_points():
            try:
                from .share_tasks import award_qualified_referral_points
                award_qualified_referral_points.delay(attribution.pk)
            except Exception:
                logger.warning('Unable to schedule referral point award', exc_info=True)
        transaction.on_commit(queue_points)
        return attribution
