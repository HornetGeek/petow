import re
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import authenticate
from django.db.models import Count, Q, Sum
from django.db import models, transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from django.conf import settings

from accounts.serializers import UserSerializer
from accounts.models import User
from .models import (
    Clinic,
    ClinicService,
    ClinicProduct,
    StorefrontOrder,
    StorefrontOrderItem,
    StorefrontBooking,
    ServicePricingTier,
    ServicePackage,
    ClinicPromotion,
    ClinicMessage,
    VeterinaryAppointment,
    ClinicStaff,
    ClinicClientRecord,
    ClinicPatientRecord,
    ClinicInvite,
)
from pets.models import Notification, ChatRoom, Pet
from pets.serializers import PublicPetSerializer
from pets.notifications import create_notification, _send_push_notification
from .permissions import IsClinicStaff
from .serializers import (
    ClinicSerializer,
    ClinicPublicSerializer,
    ClinicListSerializer,
    ClinicServiceSerializer,
    ClinicProductSerializer,
    StorefrontOrderSerializer,
    StorefrontOrderItemCreateSerializer,
    StorefrontBookingSerializer,
    StorefrontBookingUpdateSerializer,
    StorefrontBookingCreateSerializer,
    ServicePricingTierSerializer,
    ServicePackageSerializer,
    ClinicPromotionSerializer,
    ClinicMessageSerializer,
    ClinicAppointmentSerializer,
    ClinicClientSerializer,
    ClinicDashboardStatsSerializer,
    ClinicRegistrationSerializer,
    ClinicPatientRecordSerializer,
    ClinicInviteSerializer,
    VeterinarianSerializer,
)
from .invite_service import claim_invites_for_user, respond_to_invite, _build_phone_lookup_query, _normalize_email, _normalize_phone


APPOINTMENT_TYPE_LABELS = dict(VeterinaryAppointment.APPOINTMENT_TYPE_CHOICES)
APPOINTMENT_STATUS_LABELS = dict(VeterinaryAppointment.STATUS_CHOICES)
SERVICE_CATEGORY_APPOINTMENT_TYPE = {
    'general': 'checkup',
    'vaccination': 'vaccination',
    'surgery': 'surgery',
    'grooming': 'grooming',
    'dental': 'dental',
    'emergency': 'emergency',
}


class ClinicListPagination(PageNumberPagination):
    page_size = settings.REST_FRAMEWORK.get('PAGE_SIZE', 20)
    page_size_query_param = 'page_size'
    max_page_size = 100


def ensure_clinic_chat_room(clinic_patient, message=None, staff=None):
    """Ensure a ChatRoom exists for a clinic patient conversation."""
    if not clinic_patient:
        return None

    chat_room = ChatRoom.objects.filter(clinic_patient=clinic_patient).first()

    if not chat_room:
        chat_room = ChatRoom.objects.create(
            clinic_patient=clinic_patient,
            clinic_staff=staff,
            clinic_message=message
        )
        return chat_room

    updates = []

    if message and chat_room.clinic_message_id != getattr(message, 'id', None):
        chat_room.clinic_message = message
        updates.append('clinic_message')

    if staff and not chat_room.clinic_staff:
        chat_room.clinic_staff = staff
        updates.append('clinic_staff')

    if updates:
        updates.append('updated_at')
        chat_room.save(update_fields=updates)

    return chat_room

def get_clinic_for_user(user):
    """إرجاع العيادة المرتبطة بالمستخدم."""
    if not user.is_authenticated:
        return None

    membership_qs = user.clinic_memberships.select_related('clinic')
    primary_membership = membership_qs.filter(is_primary=True).first()
    if primary_membership:
        return primary_membership.clinic

    membership = membership_qs.first()
    if membership:
        return membership.clinic

    return user.owned_clinics.first()


class ClinicContextMixin:
    """Mixin helper للحصول على العيادة من المستخدم الحالي."""

    def get_clinic(self):
        clinic = get_clinic_for_user(self.request.user)
        if not clinic:
            raise Http404("لم يتم العثور على عيادة مرتبطة بهذا الحساب")
        return clinic


class ClinicRegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ClinicRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        clinic = result['clinic']
        owner = result['owner']

        token, _ = Token.objects.get_or_create(user=owner)

        return Response(
            {
                'token': token.key,
                'clinic': ClinicSerializer(clinic).data,
                'user': UserSerializer(owner).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ClinicLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {'error': 'البريد الإلكتروني وكلمة المرور مطلوبان'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=email, password=password)
        if not user:
            return Response(
                {'error': 'بيانات تسجيل الدخول غير صحيحة'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if getattr(user, 'user_type', '') != 'clinic_staff':
            return Response(
                {'error': 'هذا الحساب غير مخول للوصول إلى لوحة تحكم العيادة'},
                status=status.HTTP_403_FORBIDDEN,
            )

        clinic = get_clinic_for_user(user)
        if not clinic:
            return Response(
                {'error': 'لم يتم ربط هذا الحساب بأي عيادة'},
                status=status.HTTP_404_NOT_FOUND,
            )

        token, _ = Token.objects.get_or_create(user=user)

        return Response(
            {
                'token': token.key,
                'clinic': ClinicSerializer(clinic).data,
                'user': UserSerializer(user).data,
            }
        )


class ClinicDashboardOverviewView(ClinicContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        clinic = self.get_clinic()
        today = timezone.localdate()
        start_of_month = today.replace(day=1)
        seven_days_ago = today - timedelta(days=6)

        appointments_qs = (
            VeterinaryAppointment.objects
            .filter(clinic=clinic)
            .select_related('pet', 'owner')
        )

        todays_appointments = appointments_qs.filter(scheduled_date=today).count()
        upcoming_appointments = appointments_qs.filter(
            scheduled_date__gt=today,
            status__in=['scheduled', 'rescheduled'],
        ).count()
        pending_requests = appointments_qs.filter(status='scheduled').count()

        revenue_this_month = appointments_qs.filter(
            scheduled_date__gte=start_of_month,
            payment_status='paid',
        ).aggregate(total=Sum('service_fee'))['total'] or Decimal('0.00')

        clients_count = appointments_qs.values('owner').distinct().count()
        pets_seen = appointments_qs.values('pet').distinct().count()

        top_services = [
            {
                'type': item['appointment_type'],
                'label': APPOINTMENT_TYPE_LABELS.get(item['appointment_type'], item['appointment_type']),
                'value': item['count'],
            }
            for item in (
                appointments_qs
                .values('appointment_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
        ]

        status_breakdown = [
            {
                'status': item['status'],
                'label': APPOINTMENT_STATUS_LABELS.get(item['status'], item['status']),
                'value': item['count'],
            }
            for item in (
                appointments_qs
                .values('status')
                .annotate(count=Count('id'))
                .order_by('-count')
            )
        ]

        appointment_trend_map = {today - timedelta(days=i): 0 for i in range(0, 7)}
        for item in (
            appointments_qs
            .filter(scheduled_date__gte=seven_days_ago)
            .values('scheduled_date')
            .annotate(count=Count('id'))
        ):
            appointment_trend_map[item['scheduled_date']] = item['count']

        appointment_trend = [
            {
                'date': day.isoformat(),
                'value': appointment_trend_map[day],
            }
            for day in sorted(appointment_trend_map.keys())
        ]

        revenue_trend_map = {today - timedelta(days=i): Decimal('0.00') for i in range(0, 7)}
        for item in (
            appointments_qs
            .filter(scheduled_date__gte=seven_days_ago, payment_status='paid')
            .values('scheduled_date')
            .annotate(total=Sum('service_fee'))
        ):
            revenue_trend_map[item['scheduled_date']] = item['total'] or Decimal('0.00')

        revenue_trend = [
            {
                'date': day.isoformat(),
                'value': str(revenue_trend_map[day]),
            }
            for day in sorted(revenue_trend_map.keys())
        ]

        recent_messages = [
            {
                'id': msg.id,
                'sender': msg.sender_name,
                'subject': msg.subject,
                'status': msg.status,
                'priority': msg.priority,
                'received_at': msg.created_at.isoformat(),
            }
            for msg in clinic.messages.all().order_by('-created_at')[:5]
        ]

        serializer = ClinicDashboardStatsSerializer(
            {
                'todays_appointments': todays_appointments,
                'upcoming_appointments': upcoming_appointments,
                'pending_requests': pending_requests,
                'revenue_this_month': revenue_this_month,
                'clients_count': clients_count,
                'pets_seen': pets_seen,
                'top_services': top_services,
                'appointment_trend': appointment_trend,
                'revenue_trend': revenue_trend,
                'appointments_by_status': status_breakdown,
                'recent_messages': recent_messages,
            }
        )
        return Response(serializer.data)


class ClinicClientsView(ClinicContextMixin, APIView):
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        clinic = self.get_clinic()
        query = request.query_params.get('q')

        appointments = (
            VeterinaryAppointment.objects
            .filter(clinic=clinic)
            .select_related('owner', 'pet', 'pet__breed')
            .order_by('-scheduled_date', '-scheduled_time')
        )

        if query:
            appointments = appointments.filter(
                Q(owner__first_name__icontains=query) |
                Q(owner__last_name__icontains=query) |
                Q(owner__email__icontains=query) |
                Q(owner__phone__icontains=query) |
                Q(pet__name__icontains=query)
            )

        clients_map = {}

        client_records = clinic.client_records.prefetch_related('pets')
        for record in client_records:
            pets_payload = []
            latest_visit = None
            for pet in record.pets.all():
                if pet.last_visit:
                    dt = datetime.combine(pet.last_visit, datetime.min.time())
                    if timezone.is_naive(dt):
                        dt = timezone.make_aware(dt, timezone.get_current_timezone())
                else:
                    dt = None
                pets_payload.append({
                    'id': pet.id,
                    'name': pet.name,
                    'type': pet.species,
                    'breed': pet.breed,
                    'last_status': pet.status,
                    'last_visit': dt,
                })
                if dt and (latest_visit is None or dt > latest_visit):
                    latest_visit = dt
            clients_map[('record', record.id)] = {
                'id': record.id,
                'full_name': record.full_name,
                'email': record.email or '',
                'phone': record.phone or '',
                'pets': {pet['id']: pet for pet in pets_payload},
                'last_visit': latest_visit,
            }

        for appointment in appointments:
            owner = appointment.owner
            clinic_patient = appointment.clinic_patient
            owner_record = clinic_patient.owner if clinic_patient and clinic_patient.owner_id else None
            appointment_dt = datetime.combine(appointment.scheduled_date, appointment.scheduled_time)
            if timezone.is_naive(appointment_dt):
                appointment_dt = timezone.make_aware(appointment_dt, timezone.get_current_timezone())

            if owner:
                key = ('user', owner.id)
            elif owner_record:
                key = ('record', owner_record.id)
            else:
                continue
            client_entry = clients_map.get(key)
            if not client_entry:
                if owner:
                    client_entry = {
                        'id': owner.id,
                        'full_name': owner.get_full_name() or owner.email,
                        'email': owner.email,
                        'phone': owner.phone or '',
                        'pets': {},
                        'last_visit': appointment_dt,
                    }
                else:
                    client_entry = {
                        'id': owner_record.id,
                        'full_name': owner_record.full_name,
                        'email': owner_record.email or '',
                        'phone': owner_record.phone or '',
                        'pets': {},
                        'last_visit': appointment_dt,
                    }
                clients_map[key] = client_entry
            else:
                if appointment_dt > client_entry['last_visit']:
                    client_entry['last_visit'] = appointment_dt

            pet_key = appointment.pet_id or (clinic_patient.id if clinic_patient else None)
            if not pet_key:
                continue
            pet_entry = client_entry['pets'].get(pet_key)
            if not pet_entry:
                if appointment.pet_id:
                    pet_entry = {
                        'id': appointment.pet.id,
                        'name': appointment.pet.name,
                        'type': appointment.pet.pet_type,
                        'breed': appointment.pet.breed.name if appointment.pet.breed else None,
                        'last_status': appointment.status,
                        'last_visit': appointment_dt,
                    }
                else:
                    pet_entry = {
                        'id': clinic_patient.id,
                        'name': clinic_patient.name,
                        'type': clinic_patient.species,
                        'breed': clinic_patient.breed,
                        'last_status': appointment.status,
                        'last_visit': appointment_dt,
                    }
                client_entry['pets'][pet_key] = pet_entry
            else:
                if appointment_dt > pet_entry['last_visit']:
                    pet_entry['last_visit'] = appointment_dt
                    pet_entry['last_status'] = appointment.status

        clients_payload = []
        for entry in clients_map.values():
            pets_list = []
            for pet in entry['pets'].values():
                pets_list.append({
                    'id': pet['id'],
                    'name': pet['name'],
                    'type': pet['type'],
                    'breed': pet['breed'],
                    'last_status': pet['last_status'],
                    'last_visit': pet['last_visit'],
                })
            payload = {
                'id': entry['id'],
                'full_name': entry['full_name'],
                'email': entry['email'],
                'phone': entry['phone'],
                'pet_count': len(pets_list),
                'pets': pets_list,
                'last_visit': entry['last_visit'],
            }
            clients_payload.append(payload)

        serializer = ClinicClientSerializer(clients_payload, many=True)
        return Response(serializer.data)


class ClinicSettingsView(ClinicContextMixin, generics.RetrieveUpdateAPIView):
    serializer_class = ClinicSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.get_clinic()

class PublicStorefrontView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, clinic_id):
        clinic = get_object_or_404(Clinic, id=clinic_id, is_active=True)

        products = clinic.products.filter(is_active=True).order_by('-updated_at')
        services = (
            clinic.services_list
            .filter(is_active=True)
            .prefetch_related('pricing_tiers')
            .order_by('display_order', 'name')
        )

        payload = {
            'clinic': ClinicPublicSerializer(clinic, context={'request': request}).data,
            'products': ClinicProductSerializer(products, many=True, context={'request': request}).data,
            'services': ClinicServiceSerializer(services, many=True, context={'request': request}).data,
        }
        return Response(payload)


class PublicClinicListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        clinics = (
            Clinic.objects
            .filter(is_active=True)
            .annotate(staff_count=Count('staff_members', distinct=True))
            .filter(Q(owner__isnull=False) | Q(staff_members__isnull=False))
            .distinct()
        )
        service_category = request.query_params.get('service_category')
        if service_category:
            categories = [cat.strip() for cat in service_category.split(',') if cat.strip()]
            if categories:
                category_labels = dict(ClinicService.CATEGORY_CHOICES)
                text_query = None
                for cat in categories:
                    label = category_labels.get(cat)
                    for term in (cat, label):
                        if not term:
                            continue
                        clause = Q(services__icontains=term)
                        text_query = clause if text_query is None else text_query | clause
                filter_query = Q(services_list__category__in=categories, services_list__is_active=True)
                if text_query is not None:
                    filter_query |= text_query
                clinics = clinics.filter(filter_query)
        clinics = clinics.prefetch_related(
            models.Prefetch(
                'services_list',
                queryset=ClinicService.objects.filter(is_active=True).only('category', 'clinic_id')
            )
        )
        paginator = ClinicListPagination()
        page = paginator.paginate_queryset(clinics, request, view=self)
        serializer = ClinicListSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

class PublicStorefrontOrderView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, clinic_id):
        clinic = get_object_or_404(Clinic, id=clinic_id, is_active=True)

        items_serializer = StorefrontOrderItemCreateSerializer(data=request.data.get('items', []), many=True)
        items_serializer.is_valid(raise_exception=True)
        items = items_serializer.validated_data

        if not items:
            raise ValidationError({'items': ['يجب إضافة منتج واحد على الأقل']})

        customer_name = request.data.get('customer_name') or request.data.get('name')
        customer_phone = request.data.get('customer_phone') or request.data.get('phone')
        customer_email = request.data.get('customer_email') or request.data.get('email')
        delivery_address = request.data.get('delivery_address') or request.data.get('address')
        notes = request.data.get('notes')

        if not customer_name or not customer_phone:
            raise ValidationError({'detail': 'الاسم ورقم الهاتف مطلوبان'})

        with transaction.atomic():
            order = StorefrontOrder.objects.create(
                clinic=clinic,
                customer_name=customer_name,
                customer_phone=customer_phone,
                customer_email=customer_email,
                delivery_address=delivery_address,
                notes=notes,
                status='new',
            )

            total = Decimal('0')
            for item in items:
                product = get_object_or_404(
                    ClinicProduct,
                    id=item['product_id'],
                    clinic=clinic,
                    is_active=True
                )
                quantity = item['quantity']
                unit_price = Decimal(str(product.price))
                line_total = unit_price * quantity

                StorefrontOrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total
                )
                total += line_total

            order.total_amount = total
            order.save(update_fields=['total_amount'])

        return Response(StorefrontOrderSerializer(order).data, status=status.HTTP_201_CREATED)


class PublicStorefrontBookingView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, clinic_id):
        clinic = get_object_or_404(Clinic, id=clinic_id, is_active=True)

        serializer = StorefrontBookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        service = get_object_or_404(
            ClinicService,
            id=data['service_id'],
            clinic=clinic,
            is_active=True
        )

        booking = StorefrontBooking.objects.create(
            clinic=clinic,
            service=service,
            customer_name=data['customer_name'],
            customer_phone=data['customer_phone'],
            customer_email=data.get('customer_email'),
            pet_name=data.get('pet_name'),
            preferred_date=data.get('preferred_date'),
            preferred_time=data.get('preferred_time'),
            notes=data.get('notes'),
            status='new',
            quoted_price=service.base_price,
        )

        preferred_date = data.get('preferred_date')
        preferred_time = data.get('preferred_time')
        customer_phone = data.get('customer_phone')
        customer_email = data.get('customer_email')
        pet_name = data.get('pet_name')

        if preferred_date and preferred_time and pet_name and (customer_phone or customer_email):
            appointment_owner = None
            appointment_pet = None

            contact_query = Q()
            if customer_phone:
                contact_query |= Q(owner__phone__iexact=customer_phone)
            if customer_email:
                contact_query |= Q(owner__email__iexact=customer_email)

            patient_queryset = (
                ClinicPatientRecord.objects
                .filter(clinic=clinic)
                .filter(contact_query)
                .filter(name__iexact=pet_name)
            )

            patient = (
                patient_queryset
                .select_related('linked_user', 'linked_pet', 'owner')
                .filter(linked_user__isnull=False, linked_pet__isnull=False)
                .first()
            )

            if patient:
                appointment_owner = patient.linked_user
                appointment_pet = patient.linked_pet
            else:
                owner_queryset = User.objects.filter(user_type='pet_owner')
                if customer_phone:
                    appointment_owner = owner_queryset.filter(phone=customer_phone).first()
                if not appointment_owner and customer_email:
                    appointment_owner = owner_queryset.filter(email__iexact=customer_email).first()

                if appointment_owner:
                    appointment_pet = Pet.objects.filter(owner=appointment_owner, name__iexact=pet_name).first()

            if appointment_owner and appointment_pet:
                appointment_type = SERVICE_CATEGORY_APPOINTMENT_TYPE.get(service.category, 'other')

                existing = VeterinaryAppointment.objects.filter(
                    clinic=clinic,
                    pet=appointment_pet,
                    owner=appointment_owner,
                    scheduled_date=preferred_date,
                    scheduled_time=preferred_time,
                ).exists()

                if not existing:
                    VeterinaryAppointment.objects.create(
                        clinic=clinic,
                        pet=appointment_pet,
                        owner=appointment_owner,
                        appointment_type=appointment_type,
                        scheduled_date=preferred_date,
                        scheduled_time=preferred_time,
                        duration_minutes=service.duration_minutes or 30,
                        reason=f"حجز متجر: {service.name}",
                        notes=data.get('notes') or '',
                        status='scheduled',
                        payment_status='unpaid',
                        service_fee=service.base_price,
                    )

                booking.status = 'confirmed'
                booking.save(update_fields=['status'])

        return Response(StorefrontBookingSerializer(booking).data, status=status.HTTP_201_CREATED)

class ClinicPatientViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    serializer_class = ClinicPatientRecordSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = ClinicPatientRecord.objects.filter(clinic=clinic).select_related('owner', 'linked_user', 'linked_pet')
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(species__icontains=search)
                | Q(breed__icontains=search)
                | Q(owner__full_name__icontains=search)
                | Q(owner__email__icontains=search)
                | Q(owner__phone__icontains=search)
            )
        return queryset.order_by('-created_at')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['clinic'] = self.get_clinic()
        return context


class ClinicAppointmentViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    serializer_class = ClinicAppointmentSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = (
            VeterinaryAppointment.objects
            .filter(clinic=clinic)
            .select_related('pet', 'owner', 'clinic', 'clinic_patient', 'clinic_patient__owner')
            .order_by('-scheduled_date', '-scheduled_time')
        )
        clinic_patient_id = self.request.query_params.get('clinic_patient') or self.request.query_params.get('clinicPatientId')
        if clinic_patient_id:
            try:
                patient = ClinicPatientRecord.objects.filter(clinic=clinic, id=clinic_patient_id).first()
            except Exception:
                patient = None
            if patient and patient.linked_pet_id:
                queryset = queryset.filter(Q(clinic_patient=patient) | Q(pet=patient.linked_pet_id))
            else:
                queryset = queryset.filter(clinic_patient_id=clinic_patient_id)
        pet_id = self.request.query_params.get('pet')
        if pet_id and not clinic_patient_id:
            queryset = queryset.filter(pet_id=pet_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        appointment_type = self.request.query_params.get('type')
        if appointment_type:
            queryset = queryset.filter(appointment_type=appointment_type)
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['clinic'] = self.get_clinic()
        return context


class ClinicServiceViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    """ViewSet for managing clinic services"""
    serializer_class = ClinicServiceSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.services_list.all().prefetch_related('pricing_tiers').order_by('display_order', '-is_featured', 'name')
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        # Filter by pet type
        pet_type = self.request.query_params.get('pet_type')
        if pet_type:
            queryset = queryset.filter(applicable_pet_types__contains=[pet_type])
        
        # Filter by featured status
        is_featured = self.request.query_params.get('is_featured')
        if is_featured is not None:
            queryset = queryset.filter(is_featured=is_featured.lower() == 'true')
        
        # Search by name or description
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )
        
        return queryset

    def perform_create(self, serializer):
        clinic = self.get_clinic()
        serializer.save(clinic=clinic)

    def perform_update(self, serializer):
        clinic = self.get_clinic()
        serializer.save(clinic=clinic)


class ClinicProductViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    """ViewSet for managing clinic products"""
    serializer_class = ClinicProductSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.products.all().order_by('-updated_at')

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(description__icontains=search) | Q(sku__icontains=search)
            )

        return queryset

    def perform_create(self, serializer):
        serializer.save(clinic=self.get_clinic())

    def perform_update(self, serializer):
        serializer.save(clinic=self.get_clinic())


class ClinicStorefrontBookingViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    """ViewSet for managing storefront bookings in the clinic dashboard"""
    serializer_class = StorefrontBookingSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]
    http_method_names = ['get', 'patch', 'head', 'options']
    lookup_field = 'public_id'

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = StorefrontBooking.objects.filter(clinic=clinic).select_related('service').order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(customer_name__icontains=search)
                | Q(customer_phone__icontains=search)
                | Q(service__name__icontains=search)
            )

        return queryset

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return StorefrontBookingUpdateSerializer
        return StorefrontBookingSerializer



class ServicePricingTierViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    """ViewSet for managing service pricing tiers"""
    serializer_class = ServicePricingTierSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        # Filter tiers by services belonging to this clinic
        queryset = ServicePricingTier.objects.filter(service__clinic=clinic).select_related('service')
        
        service_id = self.request.query_params.get('service_id')
        if service_id:
            queryset = queryset.filter(service_id=service_id)
            
        return queryset


class ServicePackageViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    """ViewSet for managing service packages"""
    serializer_class = ServicePackageSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.service_packages.all().prefetch_related('services').order_by('-is_featured', '-created_at')
        
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
            
        is_featured = self.request.query_params.get('is_featured')
        if is_featured is not None:
            queryset = queryset.filter(is_featured=is_featured.lower() == 'true')
            
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(clinic=self.get_clinic())

    def perform_update(self, serializer):
        serializer.save(clinic=self.get_clinic())


class ClinicPromotionViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    serializer_class = ClinicPromotionSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.promotions.all().order_by('-start_date')
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset

    def perform_create(self, serializer):
        serializer.save(clinic=self.get_clinic())

    def perform_update(self, serializer):
        serializer.save(clinic=self.get_clinic())


class ClinicMessageViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    serializer_class = ClinicMessageSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.messages.all().order_by('-created_at')
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)
        return queryset

    def perform_create(self, serializer):
        serializer.save(clinic=self.get_clinic())

    def perform_update(self, serializer):
        serializer.save(clinic=self.get_clinic())


class ClinicMessageSendPushView(ClinicContextMixin, APIView):
    """Send a push notification in response to a specific clinic message."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def post(self, request, message_id):
        clinic = self.get_clinic()
        message_body = (request.data.get('message') or '').strip()

        if not message_body:
            return Response({'error': 'message is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            base_message = ClinicMessage.objects.get(id=message_id, clinic=clinic)
        except ClinicMessage.DoesNotExist:
            return Response({'error': 'message not found'}, status=status.HTTP_404_NOT_FOUND)

        patients = []
        if base_message.clinic_patient:
            patients.append(base_message.clinic_patient)

        sender_email = (base_message.sender_email or '').strip()
        sender_phone = (base_message.sender_phone or '').strip()

        if not patients:
            owner_filter = Q()
            if sender_email:
                owner_filter |= Q(email__iexact=sender_email)
            if sender_phone:
                owner_filter |= Q(phone=sender_phone)

            owners = []
            if owner_filter:
                owners = list(ClinicClientRecord.objects.filter(clinic=clinic).filter(owner_filter))

            patient_qs = ClinicPatientRecord.objects.filter(clinic=clinic)
            if owners:
                patient_qs = patient_qs.filter(owner__in=owners)
            elif sender_email:
                patient_qs = patient_qs.filter(owner__email__iexact=sender_email)
            elif sender_phone:
                patient_qs = patient_qs.filter(owner__phone=sender_phone)
            else:
                patient_qs = patient_qs.none()

            patients = list(patient_qs.select_related('linked_user', 'owner'))

            if not patients and sender_email:
                fallback_match = re.match(r'^patient_(\d+)@clinic\.local$', sender_email, re.IGNORECASE)
                if fallback_match:
                    try:
                        patient_id = int(fallback_match.group(1))
                        patients = list(
                            ClinicPatientRecord.objects.filter(clinic=clinic, id=patient_id)
                            .select_related('linked_user', 'owner')
                        )
                    except (TypeError, ValueError):
                        patients = []

        if not base_message.clinic_patient and patients:
            primary_patient = patients[0]
            base_message.clinic_patient = primary_patient
            base_message.save(update_fields=['clinic_patient', 'updated_at'])

        targeted_users = {}
        skipped = []

        for patient in patients:
            user = getattr(patient, 'linked_user', None)
            if not user:
                skipped.append({'patient_id': str(patient.id), 'patient_name': patient.name or 'Pet', 'reason': 'unlinked'})
                continue
            token = (user.fcm_token or '').strip()
            if not token:
                skipped.append({'patient_id': str(patient.id), 'patient_name': patient.name or 'Pet', 'reason': 'no_token'})
                continue

            chat_room = ensure_clinic_chat_room(patient, message=base_message, staff=request.user)
            targeted_users[user.id] = {
                'user': user,
                'patient': patient,
                'chat_room': chat_room,
            }

        if not targeted_users:
            return Response(
                {
                    'error': 'No linked mobile users with push tokens for this contact',
                    'skipped': skipped,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        sender_name = request.user.get_full_name() or request.user.email or request.user.username or 'Clinic Team'
        title = f'رسالة جديدة من {clinic.name}'

        push_sent = 0
        results = []

        for entry in targeted_users.values():
            user = entry['user']
            patient = entry['patient']
            chat_room = entry['chat_room']

            extra_data = {
                'clinic_id': str(clinic.id),
                'clinic_name': clinic.name,
                'clinic_message_id': str(base_message.id),
                'sender_name': sender_name,
                'patient_id': str(patient.id),
                'patient_name': patient.name or 'Pet',
            }
            if chat_room:
                extra_data['firebase_chat_id'] = chat_room.firebase_chat_id
                extra_data['chat_room_id'] = chat_room.id

            notification = create_notification(
                user=user,
                notification_type='chat_message_received',
                title=title,
                message=message_body,
                extra_data=extra_data,
            )

            payload = {
                'type': 'clinic_chat_message',
                'clinic_id': str(clinic.id),
                'clinic_message_id': str(base_message.id),
                'sender_name': sender_name,
            }
            if chat_room:
                payload['firebase_chat_id'] = chat_room.firebase_chat_id
                payload['chat_room_id'] = str(chat_room.id)

            delivered = _send_push_notification(user, title, message_body, payload)
            if delivered:
                push_sent += 1
                notification.extra_data['delivered'] = True
                notification.save(update_fields=['extra_data'])

            if chat_room:
                chat_room.updated_at = timezone.now()
                chat_room.save(update_fields=['updated_at'])

            results.append({
                'user_id': user.id,
                'delivered': bool(delivered),
                'notification_id': notification.id,
                'firebase_chat_id': chat_room.firebase_chat_id if chat_room else None,
            })

        base_message.status = 'in_progress'
        base_message.save(update_fields=['status', 'updated_at'])

        return Response(
            {
                'recipients': len(results),
                'push_sent': push_sent,
                'results': results,
                'skipped': skipped,
            },
            status=status.HTTP_200_OK,
        )


class VeterinariansView(ClinicContextMixin, APIView):
    """API view for clinic veterinarians"""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        clinic = self.get_clinic()
        veterinarians = clinic.staff_members.filter(
            role='veterinarian'
        ).select_related('user').order_by('created_at')
        
        serializer = VeterinarianSerializer(veterinarians, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create a new veterinarian"""
        clinic = self.get_clinic()
        
        # Get user data from request
        email = request.data.get('email')
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        phone = request.data.get('phone')
        password = request.data.get('password')
        
        if not all([email, first_name, last_name, password]):
            return Response(
                {'error': 'البريد الإلكتروني، الاسم الأول، الاسم الأخير، وكلمة المرور مطلوبة'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user already exists
        if User.objects.filter(email=email).exists():
            return Response(
                {'error': 'هذا البريد الإلكتروني مستخدم بالفعل'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Create user
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                phone=phone or '',
                user_type='clinic_staff',
            )
            
            # Create clinic staff member
            staff_member = ClinicStaff.objects.create(
                user=user,
                clinic=clinic,
                role='veterinarian',
                is_primary=False,
                invitation_email=email,
            )
            
            # Return the created veterinarian
            serializer = VeterinarianSerializer(staff_member)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'حدث خطأ أثناء إنشاء الطبيب البيطري: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def patch(self, request, pk=None):
        """Update a veterinarian"""
        clinic = self.get_clinic()
        
        try:
            staff_member = clinic.staff_members.get(
                pk=pk,
                role='veterinarian'
            )
        except ClinicStaff.DoesNotExist:
            return Response(
                {'error': 'الطبيب البيطري غير موجود'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get update data from request
        first_name = request.data.get('first_name')
        last_name = request.data.get('last_name')
        email = request.data.get('email')
        phone = request.data.get('phone')
        
        try:
            user = staff_member.user
            
            # Update user data
            if first_name:
                user.first_name = first_name
            if last_name:
                user.last_name = last_name
            if email:
                # Check if email is already used by another user
                if User.objects.filter(email=email).exclude(id=user.id).exists():
                    return Response(
                        {'error': 'هذا البريد الإلكتروني مستخدم بالفعل'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                user.email = email
                user.username = email
            if phone is not None:
                user.phone = phone or ''
            
            user.save()
            
            # Return the updated veterinarian
            serializer = VeterinarianSerializer(staff_member)
            return Response(serializer.data)
            
        except Exception as e:
            return Response(
                {'error': f'حدث خطأ أثناء تحديث الطبيب البيطري: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, pk=None):
        """Delete a veterinarian"""
        clinic = self.get_clinic()
        
        try:
            staff_member = clinic.staff_members.get(
                pk=pk,
                role='veterinarian'
            )
        except ClinicStaff.DoesNotExist:
            return Response(
                {'error': 'الطبيب البيطري غير موجود'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if this is the primary veterinarian
        if staff_member.is_primary:
            return Response(
                {'error': 'لا يمكن حذف الطبيب البيطري الرئيسي'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Delete the user account
            user = staff_member.user
            staff_member.delete()
            user.delete()
            
            return Response(
                {'message': 'تم حذف الطبيب البيطري بنجاح'},
                status=status.HTTP_204_NO_CONTENT
            )
            
        except Exception as e:
            return Response(
                {'error': f'حدث خطأ أثناء حذف الطبيب البيطري: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ClinicRecipientGroupsView(ClinicContextMixin, APIView):
    """Return recipient groups with counts for the current clinic."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        clinic = self.get_clinic()
        today = timezone.localdate()

        # Owners with any appointment at this clinic
        owners_qs = (
            VeterinaryAppointment.objects
            .filter(clinic=clinic)
            .values('owner')
            .distinct()
        )
        owner_ids = [row['owner'] for row in owners_qs]
        owners = User.objects.filter(id__in=owner_ids)

        # Active: owners with patient status active OR upcoming appointments
        active_owner_ids = set(
            ClinicPatientRecord.objects.filter(clinic=clinic, status='active').values_list('owner__id', flat=True)
        )
        upcoming_owner_ids = set(
            VeterinaryAppointment.objects
            .filter(clinic=clinic, scheduled_date__gte=today, status__in=['scheduled', 'rescheduled'])
            .values_list('owner_id', flat=True)
        )
        active_ids = set(owner_ids) & (active_owner_ids | upcoming_owner_ids)

        # Overdue: scheduled in past and still scheduled
        overdue_ids = set(
            VeterinaryAppointment.objects
            .filter(clinic=clinic, scheduled_date__lt=today, status='scheduled')
            .values_list('owner_id', flat=True)
        )
        overdue_ids = set(owner_ids) & overdue_ids

        # New: joined in last 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        new_ids = set(
            owners.filter(date_joined__gte=thirty_days_ago).values_list('id', flat=True)
        )

        # VIP: 5+ appointments total at this clinic
        vip_ids = set(
            VeterinaryAppointment.objects
            .filter(clinic=clinic)
            .values('owner')
            .annotate(count=Count('id'))
            .filter(count__gte=5)
            .values_list('owner', flat=True)
        )

        payload = [
            { 'id': 'all', 'label': 'All Patients', 'count': len(owner_ids) },
            { 'id': 'active', 'label': 'Active Patients', 'count': len(active_ids) },
            { 'id': 'overdue', 'label': 'Overdue Appointments', 'count': len(overdue_ids) },
            { 'id': 'new', 'label': 'New Patients', 'count': len(new_ids) },
            { 'id': 'vip', 'label': 'VIP Patients', 'count': len(vip_ids) },
        ]

        return Response(payload)


class ClinicNotificationTemplatesView(APIView):
    """Return predefined notification templates (static for now)."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        templates = [
            {
                'id': 'appointment-reminder',
                'title': 'Appointment Reminder',
                'message': "This is a friendly reminder that your pet has an upcoming appointment. Please confirm your attendance.",
                'icon': '📅'
            },
            {
                'id': 'vaccination-due',
                'title': 'Vaccination Due',
                'message': "It's time for your pet's annual vaccinations. Please schedule an appointment to keep your pet protected.",
                'icon': '💉'
            },
            {
                'id': 'new-service',
                'title': 'New Service Announcement',
                'message': "We're excited to announce a new service at our clinic. Contact us to learn more about how this can benefit your pet.",
                'icon': '🎉'
            },
            {
                'id': 'holiday-hours',
                'title': 'Holiday Hours',
                'message': 'Please note our special holiday hours. We want to ensure you can reach us when you need us most.',
                'icon': '🏥'
            },
        ]
        return Response(templates)


class ClinicBroadcastView(ClinicContextMixin, APIView):
    """Send a push broadcast to selected clinic patients."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def post(self, request):
        clinic = self.get_clinic()
        title = (request.data.get('title') or '').strip()
        message = (request.data.get('message') or '').strip()
        raw_recipients = request.data.get('recipients') or []
        schedule_type = (request.data.get('schedule_type') or 'now').lower()

        if not title or not message:
            return Response({'error': 'title and message are required'}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(raw_recipients, list) or not raw_recipients:
            return Response({'error': 'recipients must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        if schedule_type != 'now':
            return Response({'error': 'Scheduling is not supported yet'}, status=status.HTTP_400_BAD_REQUEST)

        patient_ids_raw = []
        for entry in raw_recipients:
            if entry is None:
                continue
            value = str(entry).strip()
            if not value:
                continue
            if value.lower().startswith('patient:'):
                value = value.split(':', 1)[1].strip()
            patient_ids_raw.append(value)

        if not patient_ids_raw:
            return Response({'error': 'No valid patient recipients provided'}, status=status.HTTP_400_BAD_REQUEST)

        all_int = True
        int_ids = []
        for value in patient_ids_raw:
            try:
                int_ids.append(int(value))
            except (TypeError, ValueError):
                all_int = False
                break

        patient_qs = ClinicPatientRecord.objects.filter(clinic=clinic)
        if all_int:
            patient_qs = patient_qs.filter(id__in=int_ids)
        else:
            patient_qs = patient_qs.filter(id__in=patient_ids_raw)

        patients = list(patient_qs.select_related('linked_user', 'owner'))
        if not patients:
            return Response({'error': 'No matching patients found for this clinic'}, status=status.HTTP_400_BAD_REQUEST)

        push_sent = 0
        targeted = 0
        skipped = []
        results = []

        for patient in patients:
            user = patient.linked_user
            if not user:
                skipped.append({'patient_id': str(patient.id), 'patient_name': patient.name or 'Pet', 'reason': 'unlinked'})
                continue

            token = (user.fcm_token or '').strip()
            if not token:
                skipped.append({'patient_id': str(patient.id), 'patient_name': patient.name or 'Pet', 'reason': 'no_token'})
                continue

            targeted += 1
            pet_name = patient.name or 'Pet'
            payload = {
                'type': 'clinic_broadcast',
                'clinic_id': str(clinic.id),
                'patient_id': str(patient.id),
                'patient_name': pet_name,
            }
            extra_data = {
                'clinic_id': str(clinic.id),
                'clinic_name': clinic.name,
                'patient_id': str(patient.id),
                'patient_name': pet_name,
                'delivered': False,
            }

            notification = create_notification(
                user=user,
                notification_type='clinic_broadcast',
                title=title,
                message=message,
                extra_data=extra_data,
            )

            delivered = _send_push_notification(user, title, message, payload)
            if delivered:
                push_sent += 1
                notification.extra_data['delivered'] = True
                notification.save(update_fields=['extra_data'])

            results.append({
                'patient_id': str(patient.id),
                'patient_name': pet_name,
                'user_id': user.id,
                'delivered': bool(delivered),
                'notification_id': notification.id,
            })

        if targeted == 0:
            return Response({
                'error': 'No patients are linked to mobile users with push tokens',
                'skipped': skipped,
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'recipients': targeted,
            'push_sent': push_sent,
            'results': results,
            'skipped': skipped,
        }, status=status.HTTP_200_OK)


class ClinicBroadcastStatsView(ClinicContextMixin, APIView):
    """Return aggregate statistics for clinic push broadcasts."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request):
        clinic = self.get_clinic()
        base_qs = Notification.objects.filter(
            type='clinic_broadcast',
            extra_data__clinic_id=str(clinic.id),
        )
        total = base_qs.count()
        delivered_total = base_qs.filter(extra_data__delivered=True).count()
        latest = base_qs.order_by('-created_at').first()

        payload = {
            'push_sent_total': total,
            'push_delivered_total': delivered_total,
            'last_push_at': latest.created_at.isoformat() if latest else None,
            'last_push_title': latest.title if latest else None,
        }
        return Response(payload)


class ClinicInviteListView(APIView):
    """Return clinic invites associated with the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        claim_invites_for_user(user)

        status_param = request.query_params.get('status')
        invites = ClinicInvite.objects.filter(recipient=user)
        if status_param and status_param != 'all':
            invites = invites.filter(status=status_param)
        elif not status_param:
            invites = invites.filter(status=ClinicInvite.STATUS_PENDING)

        invites = invites.select_related('clinic', 'patient', 'owner_record').order_by('-created_at')
        serializer = ClinicInviteSerializer(invites, many=True)
        return Response(serializer.data)


class ClinicInviteRespondView(APIView):
    """Accept or decline a clinic invite."""
    permission_classes = [IsAuthenticated]

    def post(self, request, token, action):
        user = request.user
        claim_invites_for_user(user)

        invite = get_object_or_404(
            ClinicInvite.objects.select_related('clinic', 'patient', 'owner_record'),
            token=token
        )

        if invite.recipient and invite.recipient != user:
            return Response(
                {'error': 'هذه الدعوة مرتبطة بمستخدم آخر'},
                status=status.HTTP_403_FORBIDDEN
            )

        if action not in {'accept', 'decline'}:
            return Response(
                {'error': 'إجراء غير مدعوم'},
                status=status.HTTP_400_BAD_REQUEST
            )

        accept = action == 'accept'
        invite = respond_to_invite(invite, user=user, accept=accept)
        serializer = ClinicInviteSerializer(invite)
        return Response(serializer.data)


class OwnerLookupView(ClinicContextMixin, APIView):
    """Verify an owner by phone and email; return minimal user info."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def post(self, request):
        clinic = self.get_clinic()
        phone_raw = (request.data.get('phone') or '').strip()
        email_raw = (request.data.get('email') or '').strip()

        email = _normalize_email(email_raw)
        normalized_phone = _normalize_phone(phone_raw)

        # Require at least one contact detail
        if not email and not phone_raw:
            return Response({'error': 'phone or email is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Build a flexible OR filter (email exact OR phone variants)
        contact_filters = []
        if email:
            contact_filters.append(Q(email__iexact=email))
        phone_q = _build_phone_lookup_query(phone_raw, normalized_phone)
        if phone_q is not None:
            contact_filters.append(phone_q)

        if not contact_filters:
            return Response({'found': False}, status=status.HTTP_200_OK)

        combined_filter = contact_filters.pop()
        for extra in contact_filters:
            combined_filter |= extra

        candidates = list(User.objects.filter(combined_filter).distinct()[:5])
        if not candidates:
            return Response({'found': False}, status=status.HTTP_200_OK)

        # Prefer exact email match when provided; otherwise take the first candidate
        user = None
        if email:
            user = next((u for u in candidates if (u.email or '').strip().lower() == email), None)
        if not user:
            user = candidates[0]

        # Ensure there is (or create) a clinic owner record for contact continuity
        owner_record = clinic.client_records.filter(
            (Q(email__iexact=email) if email else Q()) |
            (Q(phone=phone_raw) if phone_raw else Q())
        ).first()
        if not owner_record:
            owner_record = ClinicClientRecord.objects.create(
                clinic=clinic,
                full_name=user.get_full_name() or user.email,
                email=email or user.email,
                phone=normalized_phone or phone_raw or user.phone or '',
            )
        else:
            # Update owner record with the phone from the form if it's missing
            updates = {}
            if phone_raw and not owner_record.phone:
                updates['phone'] = normalized_phone or phone_raw
            if email and not owner_record.email:
                updates['email'] = email
            if updates:
                for field, value in updates.items():
                    setattr(owner_record, field, value)
                owner_record.save(update_fields=list(updates.keys()) + ['updated_at'])

        payload = {
            'found': True,
            'user': {
                'id': user.id,
                'full_name': user.get_full_name() or user.email,
                'email': user.email,
                'phone': user.phone or '',
            },
            'owner_record_id': owner_record.id,
        }
        return Response(payload, status=status.HTTP_200_OK)


class PublicUserPetsView(ClinicContextMixin, APIView):
    """Return public info about a user's pets for clinic preview."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get(self, request, user_id):
        # Only public fields are returned via PublicPetSerializer
        pets_qs = Pet.objects.filter(owner_id=user_id).select_related('breed')
        serializer = PublicPetSerializer(pets_qs, many=True, context={'request': request})
        return Response(serializer.data)


class PrepareInviteView(ClinicContextMixin, APIView):
    """Create or reuse a ClinicPatientRecord and prepare an invite for association."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def post(self, request):
        clinic = self.get_clinic()
        user_id = request.data.get('user_id')
        pet_id = request.data.get('pet_id')
        local_pet = request.data.get('local_pet') or {}
        
        # Get phone and email from request (if provided by the lookup flow)
        phone_raw = (request.data.get('phone') or '').strip()
        email_raw = (request.data.get('email') or '').strip()

        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'user not found'}, status=status.HTTP_404_NOT_FOUND)

        # Use provided contact info or fall back to user's stored info
        owner_email = email_raw or target_user.email
        owner_phone = phone_raw or target_user.phone or ''
        if phone_raw:
            owner_phone = _normalize_phone(phone_raw) or phone_raw

        # Ensure owner record exists in clinic
        owner_record = clinic.client_records.filter(
            models.Q(email__iexact=owner_email) | models.Q(phone=owner_phone)
        ).first()
        if not owner_record:
            owner_record = ClinicClientRecord.objects.create(
                clinic=clinic,
                full_name=target_user.get_full_name() or target_user.email,
                email=owner_email,
                phone=owner_phone,
            )
        else:
            # Update owner record with the phone/email from request if missing
            updates = {}
            if owner_phone and not owner_record.phone:
                updates['phone'] = owner_phone
            if owner_email and not owner_record.email:
                updates['email'] = owner_email
            if updates:
                for field, value in updates.items():
                    setattr(owner_record, field, value)
                owner_record.save(update_fields=list(updates.keys()) + ['updated_at'])

        # Branch: select existing pet vs register new local patient
        selected_pet = None
        if pet_id:
            try:
                selected_pet = Pet.objects.get(id=pet_id, owner_id=target_user.id)
            except Pet.DoesNotExist:
                return Response({'error': 'pet not found for this user'}, status=status.HTTP_404_NOT_FOUND)

            # Idempotent get_or_create based on clinic + linked_pet
            patient, created = ClinicPatientRecord.objects.get_or_create(
                clinic=clinic,
                linked_pet=selected_pet,
                defaults={
                    'owner': owner_record,
                    'name': selected_pet.name,
                    'species': selected_pet.pet_type,
                    'breed': selected_pet.breed.name if selected_pet.breed else '',
                    'gender': selected_pet.gender,
                    'status': 'active',
                }
            )
        else:
            # Create a local-only patient (unlinked) using provided minimal fields
            name = (local_pet.get('name') or '').strip()
            species = (local_pet.get('species') or '').strip() or 'dogs'
            breed = (local_pet.get('breed') or '').strip() or ''
            gender = (local_pet.get('gender') or '').strip() or 'unknown'
            date_of_birth_raw = local_pet.get('date_of_birth')
            
            # Parse date_of_birth if provided as string
            date_of_birth = None
            if date_of_birth_raw:
                if isinstance(date_of_birth_raw, str):
                    from datetime import datetime
                    try:
                        date_of_birth = datetime.strptime(date_of_birth_raw, '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        pass
                else:
                    date_of_birth = date_of_birth_raw

            if not name:
                return Response({'error': 'local_pet.name is required when no pet_id provided'}, status=status.HTTP_400_BAD_REQUEST)

            patient = ClinicPatientRecord.objects.create(
                clinic=clinic,
                owner=owner_record,
                name=name,
                species=species,
                breed=breed,
                gender=gender,
                date_of_birth=date_of_birth,
                status='active',
            )

        # Create or refresh an invite; attach intended_pet if selected
        from .invite_service import create_invite_for_patient
        invite = create_invite_for_patient(patient, resend=False, intended_pet=selected_pet)

        # Response payload
        patient_payload = ClinicPatientRecordSerializer(patient).data
        invite_payload = {
            'token': str(invite.token),
            'status': invite.status,
            'createdAt': invite.created_at.isoformat(),
        }
        return Response({'patient': patient_payload, 'invite': invite_payload}, status=status.HTTP_201_CREATED)
