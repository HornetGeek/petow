import os
import requests
import logging
from typing import Dict, List, Optional, Tuple
import hashlib
import csv
import json
import urllib.parse

from django.core.management.base import BaseCommand
from django.conf import settings
from django.core.mail import send_mail

from accounts.models import User
from accounts.firebase_service import firebase_service

logger = logging.getLogger(__name__)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> Optional[float]:
    try:
        import math
        rlat1 = math.radians(float(lat1))
        rlon1 = math.radians(float(lon1))
        rlat2 = math.radians(float(lat2))
        rlon2 = math.radians(float(lon2))
        dlat = rlat2 - rlat1
        dlon = rlon2 - rlon1
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return round(6371 * c, 2)
    except Exception:
        return None


class Command(BaseCommand):
    help = 'Fetch pets from production API, compute nearby matches per owner, and send email + optional push notifications.'

    def add_arguments(self, parser):
        parser.add_argument('--base-url', type=str, default=os.environ.get('PETOW_API_BASE_URL', 'https://api.petow.app'), help='Production API base URL')
        parser.add_argument('--page-size', type=int, default=100, help='Page size for pets listing')
        parser.add_argument('--limit-per-user', type=int, default=3, help='Max recommendations per owner')
        parser.add_argument('--max-distance-km', type=float, default=50.0, help='Max distance in KM to include recommendation')
        parser.add_argument('--pet-type', type=str, choices=['cats', 'dogs'], help='Filter candidates by pet type')
        parser.add_argument('--only-owner-email', type=str, help='Process one owner email only')
        parser.add_argument('--dry-run', action='store_true', help='Do not send emails/push, just print/summary')
        parser.add_argument('--no-email', action='store_true', help='Skip sending emails')
        parser.add_argument('--no-push', action='store_true', help='Skip sending push notifications')
        # New: send push via production API (no local DB)
        parser.add_argument('--push-via-prod', action='store_true', help='Send push by calling production admin endpoint by owner email')
        parser.add_argument('--admin-api-key', type=str, default=os.environ.get('PETOW_ADMIN_API_KEY', ''), help='Admin API key/token for production push endpoint')
        parser.add_argument('--push-endpoint', type=str, default=os.environ.get('PETOW_PUSH_ENDPOINT_PATH', '/api/accounts/admin/send-push-to-email/'), help='Relative path of the production push endpoint that accepts email, title, body, data')
        # New: send push via FCM topics (clients must subscribe to per-user topic)
        parser.add_argument('--use-topics', action='store_true', help='Send push to a per-user FCM topic derived from email (no DB, no prod endpoint)')
        parser.add_argument('--topic-prefix', type=str, default='user_', help='Prefix for user topics, e.g., user_')
        parser.add_argument('--topic-hash', type=str, choices=['sha1', 'none'], default='sha1', help='How to derive topic id from email')
        # New: provide FCM tokens from prod (JSON/CSV) to send directly without local DB
        parser.add_argument('--tokens-url', type=str, help='URL to JSON/CSV containing records with email and fcm_token')
        parser.add_argument('--tokens-file', type=str, help='Local path to JSON/CSV containing records with email and fcm_token')
        # New: fetch tokens per email via a prod user endpoint that returns fcm_token
        parser.add_argument('--user-endpoint', type=str, default='/api/accounts/users', help='Relative or absolute endpoint to fetch user profile by email; response must include fcm_token. You can use {email} placeholder.')
        parser.add_argument('--user-endpoint-method', type=str, choices=['GET', 'POST'], default='GET', help='HTTP method for user endpoint')
        parser.add_argument('--user-email-param', type=str, default='email', help='Email parameter name if user-endpoint has no {email} placeholder')

    def handle(self, *args, **options):
        base_url: str = options['base_url'].rstrip('/')
        page_size: int = options['page_size']
        limit_per_user: int = options['limit_per_user']
        max_distance_km: float = options['max_distance_km']
        pet_type_filter: Optional[str] = options.get('pet_type')
        only_owner_email: Optional[str] = options.get('only_owner_email')
        dry_run: bool = options['dry_run']
        no_email: bool = options['no_email']
        no_push: bool = options['no_push']
        push_via_prod: bool = options['push_via_prod']
        admin_api_key: str = options['admin_api_key']
        push_endpoint_path: str = options['push_endpoint']
        use_topics: bool = options['use_topics']
        topic_prefix: str = options['topic_prefix']
        topic_hash: str = options['topic_hash']
        tokens_url: Optional[str] = options.get('tokens_url')
        tokens_file: Optional[str] = options.get('tokens_file')
        user_endpoint: Optional[str] = options.get('user_endpoint')
        user_endpoint_method: str = options.get('user_endpoint_method')
        user_email_param: str = options.get('user_email_param')

        # Load tokens map from URL/file if provided
        tokens_map: Dict[str, str] = {}
        def upsert_token(email: str, token: str):
            if not email or not token:
                return
            tokens_map[email.strip().lower()] = token.strip()

        def load_tokens_from_json(obj):
            if isinstance(obj, dict):
                # Could be { email: token, ... } OR {"items": [ {email, fcm_token} ]}
                if 'items' in obj and isinstance(obj['items'], list):
                    for rec in obj['items']:
                        upsert_token(rec.get('email', ''), rec.get('fcm_token', '') or rec.get('token', ''))
                else:
                    for k, v in obj.items():
                        upsert_token(k, v)
            elif isinstance(obj, list):
                for rec in obj:
                    if isinstance(rec, dict):
                        upsert_token(rec.get('email', ''), rec.get('fcm_token', '') or rec.get('token', ''))

        def load_tokens_from_csv(text: str):
            try:
                reader = csv.DictReader(text.splitlines())
                for rec in reader:
                    upsert_token(rec.get('email', ''), rec.get('fcm_token', '') or rec.get('token', ''))
            except Exception:
                # fallback: simple two-column CSV email,token
                reader = csv.reader(text.splitlines())
                for row in reader:
                    if len(row) >= 2:
                        upsert_token(row[0], row[1])

        if tokens_url:
            try:
                r = requests.get(tokens_url, timeout=30)
                ctype = r.headers.get('Content-Type', '')
                txt = r.text
                if 'application/json' in ctype or txt.strip().startswith('{') or txt.strip().startswith('['):
                    load_tokens_from_json(json.loads(txt))
                else:
                    load_tokens_from_csv(txt)
                logger.info(f"Loaded {len(tokens_map)} tokens from URL")
            except Exception as e:
                logger.warning(f"Failed to load tokens from URL: {e}")

        if tokens_file and os.path.isfile(tokens_file):
            try:
                with open(tokens_file, 'r', encoding='utf-8') as f:
                    txt = f.read()
                if txt.strip().startswith('{') or txt.strip().startswith('['):
                    load_tokens_from_json(json.loads(txt))
                else:
                    load_tokens_from_csv(txt)
                logger.info(f"Loaded {len(tokens_map)} tokens from file (merged)")
            except Exception as e:
                logger.warning(f"Failed to load tokens from file: {e}")

        pets_endpoint = f"{base_url}/api/pets/"
        self.stdout.write(self.style.SUCCESS(f"Fetching pets from {pets_endpoint}"))

        session = requests.Session()
        session.headers.update({'Accept': 'application/json'})
        all_pets: List[dict] = []
        # Request only available pets from API to reduce noise
        next_url = f"{pets_endpoint}?page_size={page_size}&status=available"

        # Fetch paginated pets
        while next_url:
            try:
                resp = session.get(next_url, timeout=20)
                if resp.status_code != 200:
                    self.stdout.write(self.style.ERROR(f"Failed to fetch pets: {resp.status_code} {resp.text[:200]}"))
                    return
                data = resp.json()
                # DRF pagination may return dict with results/next or list directly
                if isinstance(data, dict) and 'results' in data:
                    results = data.get('results', [])
                    next_url = data.get('next')
                elif isinstance(data, list):
                    results = data
                    next_url = None
                else:
                    results = []
                    next_url = None
                all_pets.extend(results)
                self.stdout.write(self.style.NOTICE(f"Fetched {len(results)} pets (total {len(all_pets)})"))
            except requests.RequestException as e:
                self.stdout.write(self.style.ERROR(f"Network error fetching pets: {e}"))
                return

        if not all_pets:
            self.stdout.write(self.style.WARNING('No pets returned from production API'))
            return

        # Enrich each pet with owner_email from detail endpoint (list does not include owner_email)
        def fetch_owner_email(pet_id: int) -> str:
            try:
                detail_url = f"{pets_endpoint}{pet_id}/"
                r = session.get(detail_url, timeout=20)
                if r.status_code == 200:
                    detail = r.json()
                    return detail.get('owner_email') or ''
                else:
                    logger.warning(f"Detail fetch failed for pet {pet_id}: {r.status_code}")
                    return ''
            except requests.RequestException as e:
                logger.warning(f"Detail fetch error for pet {pet_id}: {e}")
                return ''

        # Filter and normalize
        def normalize_pet(p: dict) -> Optional[dict]:
            try:
                lat = p.get('latitude')
                lng = p.get('longitude')
                if lat is None or lng is None:
                    return None
                owner_email = p.get('owner_email') or fetch_owner_email(p.get('id'))
                return {
                    'id': p.get('id'),
                    'name': p.get('name'),
                    'pet_type': p.get('pet_type'),
                    'gender': p.get('gender'),
                    'breed_name': p.get('breed_name') or '',
                    'owner_email': owner_email or '',
                    'latitude': float(lat),
                    'longitude': float(lng),
                    'status': p.get('status'),
                }
            except Exception:
                return None

        normalized_pets = [pp for pp in (normalize_pet(p) for p in all_pets) if pp and pp['status'] == 'available']
        if pet_type_filter:
            normalized_pets = [p for p in normalized_pets if p['pet_type'] == pet_type_filter]

        # Group by owner
        owners: Dict[str, List[dict]] = {}
        for p in normalized_pets:
            email = p['owner_email']
            if not email:
                continue
            owners.setdefault(email, []).append(p)

        if only_owner_email:
            owners = {only_owner_email: owners.get(only_owner_email, [])}

        total_owners = len(owners)
        processed = 0
        total_emails_sent = 0
        total_push_sent = 0

        for owner_email, my_pets in owners.items():
            if not my_pets:
                continue

            # Build candidate list from pets owned by others
            candidates = [p for p in normalized_pets if p['owner_email'] != owner_email]
            if not candidates:
                continue

            # Compute recommendations across all of owner's pets
            recs: List[Tuple[dict, float]] = []
            for my in my_pets:
                for other in candidates:
                    # Must be same type and opposite gender
                    if my['pet_type'] != other['pet_type']:
                        continue
                    if my['gender'] == other['gender']:
                        continue
                    d = haversine_km(my['latitude'], my['longitude'], other['latitude'], other['longitude'])
                    if d is None or d > max_distance_km:
                        continue
                    recs.append((other, d))

            if not recs:
                continue

            recs.sort(key=lambda t: t[1])
            recs = recs[:limit_per_user]

            # Prepare message
            lines = []
            for pet, dist in recs:
                lines.append(f"- {pet['name']} ({pet['breed_name']})  المسافة: {dist} كم")
            title = "أفضل خيارات التزاوج القريبة منك"
            body = (
                "وجدنا لك ترشيحات قريبة بناءً على موقع حيواناتك:\n\n" + "\n".join(lines) +
                "\n\nافتح التطبيق للاطلاع على التفاصيل والتواصل مع المالكين."
            )

            processed += 1

            # Send email
            if not dry_run and owner_email and not no_email:
                try:
                    send_mail(
                        subject=title,
                        message=body,
                        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@petow.app'),
                        recipient_list=[owner_email],
                        fail_silently=True,
                    )
                    total_emails_sent += 1
                except Exception as e:
                    logger.warning(f"Email send failed to {owner_email}: {e}")

            # Optional push
            if not dry_run and not no_push:
                best_pet, best_distance = recs[0]
                push_title = title
                push_body = f"{best_pet['name']} على بعد {best_distance} كم. لديك {len(recs)} ترشيحات."
                push_data = {
                    'notification_type': 'recommended_pets',
                    'best_pet_name': best_pet['name'],
                    'count': str(len(recs)),
                }
                # Preferred: if we have a token from prod mapping, send directly via Firebase
                token_lookup_email = (owner_email or '').strip().lower()
                token = tokens_map.get(token_lookup_email)
                # If no token mapping provided, try fetching via user endpoint that returns fcm_token
                if not token and user_endpoint:
                    try:
                        # Build URL
                        if user_endpoint.startswith('http://') or user_endpoint.startswith('https://'):
                            ue = user_endpoint
                        else:
                            ue = f"{base_url}{user_endpoint if user_endpoint.startswith('/') else '/' + user_endpoint}"
                        if '{email}' in ue:
                            ue_final = ue.replace('{email}', urllib.parse.quote(token_lookup_email))
                            req_kwargs = {}
                        else:
                            if user_endpoint_method == 'GET':
                                sep = '&' if '?' in ue else '?'
                                ue_final = f"{ue}{sep}{user_email_param}={urllib.parse.quote(token_lookup_email)}"
                                req_kwargs = {}
                            else:
                                ue_final = ue
                                req_kwargs = {'json': {user_email_param: token_lookup_email}}
                        # Auth header support (reuse admin key if provided)
                        headers = {}
                        if admin_api_key:
                            headers['X-API-KEY'] = admin_api_key
                            headers['Authorization'] = f'Api-Key {admin_api_key}'
                        if user_endpoint_method == 'GET':
                            r = session.get(ue_final, headers=headers, timeout=20)
                        else:
                            r = session.post(ue_final, headers=headers, timeout=20, **req_kwargs)
                        if r.status_code == 200:
                            j = r.json()
                            token = None
                            # Accept various shapes:
                            # 1) {fcm_token: ...}
                            token = token or j.get('fcm_token')
                            # 2) {user: {fcm_token: ...}}
                            if not token and isinstance(j.get('user', {}), dict):
                                token = j['user'].get('fcm_token')
                            # 3) [ {email: ..., fcm_token: ...}, ... ]
                            if not token and isinstance(j, list):
                                for rec in j:
                                    if isinstance(rec, dict) and (rec.get('email', '').strip().lower() == token_lookup_email):
                                        token = rec.get('fcm_token') or rec.get('token')
                                        if token:
                                            break
                            # 4) {results: [ ... ]}
                            if not token and isinstance(j, dict) and isinstance(j.get('results'), list):
                                for rec in j['results']:
                                    if isinstance(rec, dict) and (rec.get('email', '').strip().lower() == token_lookup_email):
                                        token = rec.get('fcm_token') or rec.get('token')
                                        if token:
                                            break
                            if token:
                                tokens_map[token_lookup_email] = token
                            else:
                                logger.warning(f"User endpoint returned 200 but no fcm_token for {owner_email}")
                        else:
                            logger.warning(f"User endpoint failed for {owner_email}: {r.status_code} {r.text[:200]}")
                    except Exception as e:
                        logger.warning(f"User endpoint error for {owner_email}: {e}")

                if token and firebase_service.is_initialized:
                    try:
                        ok = firebase_service.send_notification(
                            fcm_token=token,
                            title=push_title,
                            body=push_body,
                            data=push_data,
                        )
                        if ok:
                            total_push_sent += 1
                        else:
                            logger.warning(f"Firebase send failed for {owner_email}")
                    except Exception as e:
                        logger.warning(f"Firebase send error for {owner_email}: {e}")
                elif use_topics:
                    # Compute per-user topic from email
                    email_norm = (owner_email or '').strip().lower()
                    if topic_hash == 'sha1':
                        topic_id = hashlib.sha1(email_norm.encode('utf-8')).hexdigest()
                    else:
                        # sanitize email to allowed topic chars (alphanumeric, _-)
                        topic_id = ''.join(ch if ch.isalnum() or ch in ['_', '-'] else '_' for ch in email_norm)
                    topic = f"{topic_prefix}{topic_id}"
                    try:
                        ok = firebase_service.send_topic_notification(topic=topic, title=push_title, body=push_body, data=push_data)
                        if ok:
                            total_push_sent += 1
                        else:
                            logger.warning(f"Topic push failed for {owner_email} -> {topic}")
                    except Exception as e:
                        logger.warning(f"Topic push error for {owner_email} -> {topic}: {e}")
                elif push_via_prod:
                    # Send via production admin endpoint by email (no local DB)
                    full_push_url = f"{base_url}{push_endpoint_path}" if push_endpoint_path.startswith('/') else f"{base_url}/{push_endpoint_path}"
                    headers = {
                        'Content-Type': 'application/json',
                        # Support either header style
                        'Authorization': f'Api-Key {admin_api_key}' if admin_api_key else '',
                        'X-API-KEY': admin_api_key or '',
                    }
                    # Remove empty auth headers
                    headers = {k: v for k, v in headers.items() if v}
                    payload = {
                        'email': owner_email,
                        'title': push_title,
                        'body': push_body,
                        'data': push_data,
                    }
                    try:
                        resp = session.post(full_push_url, json=payload, headers=headers, timeout=20)
                        if resp.status_code in (200, 201):
                            total_push_sent += 1
                        else:
                            logger.warning(f"Prod push endpoint failed for {owner_email}: {resp.status_code} {resp.text[:200]}")
                    except requests.RequestException as e:
                        logger.warning(f"Prod push endpoint error for {owner_email}: {e}")
                else:
                    # Fallback: local Firebase using local DB token (previous behavior)
                    try:
                        user = User.objects.filter(email=owner_email).only('fcm_token').first()
                    except Exception:
                        user = None
                    if user and user.fcm_token and firebase_service.is_initialized:
                        try:
                            firebase_service.send_notification(
                                fcm_token=user.fcm_token,
                                title=push_title,
                                body=push_body,
                                data=push_data,
                            )
                            total_push_sent += 1
                        except Exception as e:
                            logger.warning(f"Push send failed to {owner_email}: {e}")

        self.stdout.write(self.style.SUCCESS(
            f"Processed owners: {processed}/{total_owners} | Emails: {total_emails_sent} | Push: {total_push_sent}"
        )) 