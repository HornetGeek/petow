"""Daily challenge API."""
from io import BytesIO
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone
from PIL import Image, ImageOps
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, parser_classes, throttle_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework.throttling import ScopedRateThrottle
from .models import DailyChallenge, ChallengeEntry, ChallengeReaction, ChallengeReport, Pet, UserBlock

def challenges():
    return DailyChallenge.objects.filter(is_published=True, is_disabled=False)

def media(request, field):
    return request.build_absolute_uri(field.url) if field else None

def visible_entries(request):
    qs = ChallengeEntry.objects.filter(deleted_at__isnull=True, is_hidden=False,
        challenge__is_published=True, challenge__is_disabled=False).select_related('user', 'pet', 'challenge').annotate(reaction_count=Count('reactions'))
    if request.user.is_authenticated:
        pairs = UserBlock.objects.filter(Q(blocker=request.user) | Q(blocked=request.user)).values_list('blocker_id', 'blocked_id')
        ids = [b if a == request.user.id else a for a, b in pairs]
        qs = qs.exclude(user_id__in=ids)
    return qs

def entry_json(request, entry, reacted=None):
    return {'id': entry.id, 'challenge_id': entry.challenge_id,
        'image': media(request, entry.image), 'thumbnail': media(request, entry.thumbnail) or media(request, entry.image),
        'caption': entry.caption, 'created_at': entry.created_at,
        'pet': {'id': entry.pet_id, 'name': entry.pet.name} if entry.pet else None,
        'owner': {'id': entry.user_id, 'name': entry.user.first_name or 'صاحب حيوان',
                  'avatar': media(request, entry.user.profile_picture)},
        'reaction_count': getattr(entry, 'reaction_count', None) if getattr(entry, 'reaction_count', None) is not None else entry.reactions.count(),
        'reacted': entry.id in reacted if reacted is not None else (request.user.is_authenticated and entry.reactions.filter(user=request.user).exists()),
        'is_mine': request.user.is_authenticated and entry.user_id == request.user.id}

def challenge_json(request, challenge):
    now = timezone.now()
    mine = ChallengeEntry.objects.filter(challenge=challenge, user=request.user, deleted_at__isnull=True).first() if request.user.is_authenticated else None
    return {'id': challenge.id, 'slug': challenge.slug, 'title': challenge.title, 'description': challenge.description,
        'category': challenge.category, 'cover': media(request, challenge.cover),
        'starts_at': challenge.starts_at, 'ends_at': challenge.ends_at, 'server_now': now,
        'state': 'upcoming' if now < challenge.starts_at else 'active' if now < challenge.ends_at else 'completed',
        'participant_count': visible_entries(request).filter(challenge=challenge).count(),
        'my_entry': entry_json(request, mine) if mine else None}

@api_view(['GET'])
@permission_classes([AllowAny])
def current(request):
    now = timezone.now()
    active = challenges().filter(starts_at__lte=now, ends_at__gt=now).first()
    upcoming = challenges().filter(starts_at__gt=now).order_by('starts_at').first()
    return Response({'current': challenge_json(request, active) if active else None,
                     'upcoming': challenge_json(request, upcoming) if upcoming else None})

@api_view(['GET'])
@permission_classes([AllowAny])
def archives(request):
    return Response([challenge_json(request, c) for c in challenges().filter(ends_at__lte=timezone.now()).order_by('-ends_at')[:30]])

@api_view(['GET'])
@permission_classes([AllowAny])
def detail(request, challenge_id):
    c = challenges().filter(pk=challenge_id).first()
    return Response(challenge_json(request, c)) if c else Response(status=404)

class EntryCursor(CursorPagination):
    page_size = 20
    ordering = '-created_at'

@api_view(['GET'])
@permission_classes([AllowAny])
def entries(request, challenge_id):
    if not challenges().filter(pk=challenge_id).exists():
        return Response(status=404)
    pager = EntryCursor()
    page = pager.paginate_queryset(visible_entries(request).filter(challenge_id=challenge_id), request)
    ids = [e.id for e in page]
    reacted = set(ChallengeReaction.objects.filter(entry_id__in=ids, user=request.user).values_list('entry_id', flat=True)) if request.user.is_authenticated else set()
    return pager.get_paginated_response([entry_json(request, e, reacted) for e in page])

class EntryInput(serializers.Serializer):
    image = serializers.ImageField()
    caption = serializers.CharField(max_length=160, required=False, allow_blank=True)
    pet = serializers.PrimaryKeyRelatedField(queryset=Pet.objects.none(), required=False, allow_null=True)
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['pet'].queryset = Pet.objects.filter(owner=self.context['request'].user)
    def validate_image(self, value):
        if value.size > 5 * 1024 * 1024 or value.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
            raise serializers.ValidationError('الصورة لازم تكون JPG أو PNG أو WEBP وأقل من 5 ميجابايت')
        try:
            image = Image.open(value)
            if image.width * image.height > 20_000_000:
                raise serializers.ValidationError('أبعاد الصورة كبيرة جداً')
            image.verify()
            value.seek(0)
        except (OSError, ValueError):
            raise serializers.ValidationError('الصورة غير صالحة')
        return value

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
@throttle_classes([ScopedRateThrottle])
def create_entry(request, challenge_id):
    c = challenges().filter(pk=challenge_id).first()
    now = timezone.now()
    if not c or not (c.starts_at <= now < c.ends_at):
        return Response({'error': 'التحدي خلص أو مش متاح دلوقتي'}, status=409)
    existing = ChallengeEntry.objects.filter(challenge=c, user=request.user, deleted_at__isnull=True).first()
    if existing:
        return Response(entry_json(request, existing))
    serializer = EntryInput(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    full_image = ImageOps.exif_transpose(Image.open(data['image'])).convert('RGB')
    full_image.thumbnail((1600, 1600))
    full = BytesIO()
    full_image.save(full, 'JPEG', quality=85)
    full_image.thumbnail((640, 640))
    small = BytesIO()
    full_image.save(small, 'JPEG', quality=78)
    try:
        with transaction.atomic():
            entry = ChallengeEntry(challenge=c, user=request.user, pet=data.get('pet'), caption=data.get('caption', '').strip())
            entry.image.save('entry.jpg', ContentFile(full.getvalue()), save=False)
            entry.thumbnail.save('thumb.jpg', ContentFile(small.getvalue()), save=False)
            entry.save()
    except IntegrityError:
        entry = ChallengeEntry.objects.get(challenge=c, user=request.user, deleted_at__isnull=True)
    return Response(entry_json(request, entry), status=201)

@api_view(['GET', 'DELETE'])
@permission_classes([AllowAny])
def entry_detail(request, entry_id):
    entry = visible_entries(request).filter(pk=entry_id).first()
    if not entry:
        return Response(status=404)
    if request.method == 'DELETE':
        if not request.user.is_authenticated:
            return Response(status=401)
        if entry.user_id != request.user.id:
            return Response(status=403)
        entry.deleted_at = timezone.now()
        entry.save(update_fields=['deleted_at'])
        return Response(status=204)
    return Response(entry_json(request, entry))

@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def reaction(request, entry_id):
    entry = visible_entries(request).filter(pk=entry_id).first()
    if not entry:
        return Response(status=404)
    if request.method == 'PUT':
        ChallengeReaction.objects.get_or_create(entry=entry, user=request.user)
    else:
        ChallengeReaction.objects.filter(entry=entry, user=request.user).delete()
    return Response({'reacted': request.method == 'PUT', 'reaction_count': entry.reactions.count()})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ScopedRateThrottle])
def report(request, entry_id):
    entry = visible_entries(request).filter(pk=entry_id).first()
    reason = request.data.get('reason')
    if not entry or entry.user_id == request.user.id:
        return Response(status=404)
    if reason not in dict(ChallengeReport._meta.get_field('reason').choices):
        return Response({'reason': 'سبب البلاغ غير صالح'}, status=400)
    obj, _ = ChallengeReport.objects.get_or_create(entry=entry, reporter=request.user,
        defaults={'reason': reason, 'details': str(request.data.get('details', ''))[:500]})
    return Response({'id': obj.id}, status=201)

create_entry.cls.throttle_scope = 'challenge_entry'
report.cls.throttle_scope = 'challenge_report'
