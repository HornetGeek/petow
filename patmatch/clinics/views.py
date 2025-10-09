from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import authenticate
from django.db.models import Count, Q, Sum
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from accounts.serializers import UserSerializer
from accounts.models import User
from accounts.firebase_service import firebase_service
from .models import (
    Clinic,
    ClinicService,
    ClinicPromotion,
    ClinicMessage,
    VeterinaryAppointment,
    ClinicStaff,
    ClinicClientRecord,
    ClinicPatientRecord,
    ClinicInvite,
)
from pets.models import Notification
from .permissions import IsClinicStaff
from .serializers import (
    ClinicSerializer,
    ClinicServiceSerializer,
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
from .invite_service import claim_invites_for_user, respond_to_invite


APPOINTMENT_TYPE_LABELS = dict(VeterinaryAppointment.APPOINTMENT_TYPE_CHOICES)
APPOINTMENT_STATUS_LABELS = dict(VeterinaryAppointment.STATUS_CHOICES)


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
            appointment_dt = datetime.combine(appointment.scheduled_date, appointment.scheduled_time)
            if timezone.is_naive(appointment_dt):
                appointment_dt = timezone.make_aware(appointment_dt, timezone.get_current_timezone())

            key = ('user', owner.id)
            client_entry = clients_map.get(key)
            if not client_entry:
                client_entry = {
                    'id': owner.id,
                    'full_name': owner.get_full_name() or owner.email,
                    'email': owner.email,
                    'phone': owner.phone or '',
                    'pets': {},
                    'last_visit': appointment_dt,
                }
                clients_map[key] = client_entry
            else:
                if appointment_dt > client_entry['last_visit']:
                    client_entry['last_visit'] = appointment_dt

            pet_entry = client_entry['pets'].get(appointment.pet_id)
            if not pet_entry:
                pet_entry = {
                    'id': appointment.pet.id,
                    'name': appointment.pet.name,
                    'type': appointment.pet.pet_type,
                    'breed': appointment.pet.breed.name if appointment.pet.breed else None,
                    'last_status': appointment.status,
                    'last_visit': appointment_dt,
                }
                client_entry['pets'][appointment.pet_id] = pet_entry
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

    def get_object(self):
        return self.get_clinic()





class ClinicPatientViewSet(ClinicContextMixin, viewsets.ModelViewSet):
    serializer_class = ClinicPatientRecordSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = ClinicPatientRecord.objects.filter(clinic=clinic).select_related('owner')
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
            .select_related('pet', 'owner', 'clinic')
            .order_by('-scheduled_date', '-scheduled_time')
        )
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
    serializer_class = ClinicServiceSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def get_queryset(self):
        clinic = self.get_clinic()
        queryset = clinic.services_list.all().order_by('-highlight', 'name')
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
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
    """Send a broadcast to recipient groups via selected channels."""
    permission_classes = [IsAuthenticated, IsClinicStaff]

    def post(self, request):
        clinic = self.get_clinic()
        title = (request.data.get('title') or '').strip()
        message = (request.data.get('message') or '').strip()
        recipients = request.data.get('recipients') or []  # e.g., ['all','active']
        channels = request.data.get('channels') or ['in-app']  # ['email','sms','push','in-app']
        priority = (request.data.get('priority') or 'medium').lower()
        schedule_type = (request.data.get('schedule_type') or 'now').lower()
        scheduled_time = request.data.get('scheduled_time')

        if not title or not message:
            return Response({'error': 'title and message are required'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(recipients, list) or not recipients:
            return Response({'error': 'recipients must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(channels, list) or not channels:
            return Response({'error': 'channels must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)

        if schedule_type != 'now':
            return Response({'error': 'Scheduling is not supported yet'}, status=status.HTTP_400_BAD_REQUEST)

        # Build recipient users set
        today = timezone.localdate()
        owner_ids = set(
            VeterinaryAppointment.objects.filter(clinic=clinic).values_list('owner_id', flat=True).distinct()
        )
        selected_ids: set[int] = set()
        for group in recipients:
            gid = str(group).lower()
            if gid == 'all':
                selected_ids |= owner_ids
            elif gid == 'active':
                active_owner_ids = set(
                    ClinicPatientRecord.objects.filter(clinic=clinic, status='active').values_list('owner__id', flat=True)
                )
                upcoming_owner_ids = set(
                    VeterinaryAppointment.objects.filter(
                        clinic=clinic, scheduled_date__gte=today, status__in=['scheduled', 'rescheduled']
                    ).values_list('owner_id', flat=True)
                )
                selected_ids |= (owner_ids & (active_owner_ids | upcoming_owner_ids))
            elif gid == 'overdue':
                overdue_ids = set(
                    VeterinaryAppointment.objects.filter(
                        clinic=clinic, scheduled_date__lt=today, status='scheduled'
                    ).values_list('owner_id', flat=True)
                )
                selected_ids |= (owner_ids & overdue_ids)
            elif gid == 'new':
                thirty_days_ago = timezone.now() - timedelta(days=30)
                new_ids = set(User.objects.filter(id__in=owner_ids, date_joined__gte=thirty_days_ago).values_list('id', flat=True))
                selected_ids |= new_ids
            elif gid == 'vip':
                vip_ids = set(
                    VeterinaryAppointment.objects.filter(clinic=clinic)
                    .values('owner').annotate(count=Count('id')).filter(count__gte=5)
                    .values_list('owner', flat=True)
                )
                selected_ids |= vip_ids
            else:
                # ignore unknown groups silently
                pass

        users = list(User.objects.filter(id__in=selected_ids).distinct())
        if not users:
            return Response({'error': 'No recipients found for selected groups'}, status=status.HTTP_400_BAD_REQUEST)

        # Dispatch via requested channels
        email_sent = push_sent = inapp_created = sms_sent = 0

        # Prepare email from address
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or getattr(settings, 'SERVER_EMAIL', None)

        for u in users:
            if 'email' in channels and from_email and u.email:
                try:
                    email = EmailMultiAlternatives(title, message, from_email, [u.email])
                    email.send(fail_silently=True)
                    email_sent += 1
                except Exception:
                    pass

            if 'push' in channels and getattr(u, 'fcm_token', None):
                try:
                    ok = firebase_service.send_notification(u.fcm_token, title, message, data={
                        'type': 'clinic_broadcast',
                        'clinic_id': str(clinic.id),
                        'priority': priority,
                    })
                    if ok:
                        push_sent += 1
                except Exception:
                    pass

            if 'in-app' in channels:
                try:
                    Notification.objects.create(
                        user=u,
                        type='system_message',
                        title=title,
                        message=message,
                        extra_data={'source': 'clinic_broadcast', 'clinic_id': clinic.id, 'priority': priority},
                    )
                    inapp_created += 1
                except Exception:
                    pass

            if 'sms' in channels and getattr(u, 'phone', None):
                # TODO: integrate real SMS provider; for now we just count as stub
                sms_sent += 1

        return Response({
            'recipients': len(users),
            'email_sent': email_sent,
            'push_sent': push_sent,
            'in_app_created': inapp_created,
            'sms_stubbed': sms_sent,
        }, status=status.HTTP_200_OK)


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
