"""Clinic-scoped patient records shared by profile and appointment workflows."""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .models import (ClinicPatientRecord, ClinicMedicalEntry, ClinicalAmendment,
                     VeterinaryAppointment, VeterinarySession)


def can_write_clinical(user, clinic):
    return clinic.owner_id == user.id or clinic.staff_members.filter(
        user=user, role__in=['owner', 'admin', 'veterinarian']).exists()


def require_clinical(user, clinic):
    if not can_write_clinical(user, clinic):
        raise PermissionDenied('تعديل السجل الطبي متاح للطبيب ومالك العيادة والمسؤول فقط.')


def appointments_for(patient):
    match = Q(clinic_patient=patient)
    if patient.linked_pet_id:
        match |= Q(pet_id=patient.linked_pet_id)
    return VeterinaryAppointment.objects.filter(match, clinic=patient.clinic).select_related(
        'session', 'clinic', 'clinic_patient', 'session__pet', 'session__owner',
        'session__clinic_patient__owner').prefetch_related('session__documents').order_by('-scheduled_date', '-scheduled_time', '-id')


def record_for(appointment, request=None):
    from .serializers import VeterinarySessionSerializer
    session = getattr(appointment, 'session', None)
    record = {
        'id': appointment.id, 'appointment_id': appointment.id,
        'session_id': session.id if session else None,
        'source': 'session' if session else 'appointment',
        'date': str(appointment.scheduled_date), 'time': str(appointment.scheduled_time),
        'title': appointment.get_appointment_type_display(),
        'appointment_type': appointment.appointment_type,
        'status': appointment.status, 'status_display': appointment.get_status_display(),
        'clinic_name': appointment.clinic.name, 'reason': appointment.reason,
        'diagnosis': appointment.diagnosis, 'treatment': appointment.treatment,
        'notes': appointment.notes, 'next_appointment': appointment.next_appointment,
        'created_at': appointment.created_at, 'updated_at': appointment.updated_at,
    }
    if session:
        data = dict(VeterinarySessionSerializer(session, context={'request': request}).data)
        data.pop('id', None)
        record.update(data)
        from .serializers import ClinicPatientDocumentSerializer
        attachments = list(record.get('attachments') or [])
        known = {str(item.get('id')) for item in attachments}
        attachments.extend(ClinicPatientDocumentSerializer(document).data for document in session.documents.all()
                           if str(document.id) not in known)
        record.update(date=str(session.session_date), notes=session.doctor_notes,
                      doctor_name=session.care_provider_name, attachments=attachments)
    return record


def audit(user, clinic, patient, kind, record_id, before, after):
    # JSON renderer normalizes dates/decimals without losing original values.
    import json
    from rest_framework.renderers import JSONRenderer
    def normalize(value):
        return json.loads(JSONRenderer().render(value))
    previous, current = normalize(before), normalize(after)
    if previous != current:
        ClinicalAmendment.objects.create(clinic=clinic, patient=patient, actor=user,
            record_kind=kind, record_id=str(record_id), before=previous, after=current)


def sync_session(session):
    appointment = session.appointment
    appointment.scheduled_date = session.session_date
    appointment.appointment_type = session.service_type or appointment.appointment_type
    appointment.reason = session.main_complaint
    appointment.diagnosis = session.diagnosis or session.provisional_diagnosis
    appointment.treatment = session.services_performed
    appointment.notes = session.doctor_notes or session.physical_exam_notes
    appointment.next_appointment = session.next_appointment_date
    appointment.save()
    appointment.storefront_bookings.update(diagnosis=appointment.diagnosis,
        treatment=appointment.treatment, doctor_notes=appointment.notes)
    if session.clinic_patient_id:
        patient = session.clinic_patient
        latest = appointments_for(patient).filter(status__in=['COMPLETED', 'completed']).first()
        patient.last_visit = latest.scheduled_date if latest else None
        patient.next_appointment = latest.next_appointment if latest else None
        patient.save(update_fields=['last_visit', 'next_appointment', 'updated_at'])
        entry = ClinicMedicalEntry.objects.filter(session=session, kind='prescription').first()
        if session.medications or entry:
            ClinicMedicalEntry.objects.update_or_create(session=session, kind='prescription', defaults={
                'patient': patient, 'clinic': session.clinic, 'title': 'وصفة الزيارة',
                'date': session.session_date, 'data': {'medications': session.medications,
                'veterinarian': session.care_provider_name}, 'is_active': bool(session.medications)})


class MedicationSerializer(serializers.Serializer):
    medicine_name = serializers.CharField()
    dose = serializers.CharField(required=False, allow_blank=True)
    route = serializers.CharField(required=False, allow_blank=True)
    frequency = serializers.CharField(required=False, allow_blank=True)
    duration = serializers.CharField(required=False, allow_blank=True)
    instructions = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=['active', 'completed', 'cancelled', 'unknown'], required=False)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)


class MedicalEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicMedicalEntry
        fields = ['id', 'kind', 'title', 'date', 'data', 'is_active', 'session', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        patient = self.context['patient']
        session = attrs.get('session', getattr(self.instance, 'session', None))
        if session and (session.clinic_id != patient.clinic_id or
                        session.clinic_patient_id != patient.id):
            raise ValidationError({'session': 'الجلسة لا تنتمي لهذا المريض.'})
        kind = attrs.get('kind', getattr(self.instance, 'kind', None))
        if self.instance and kind != self.instance.kind:
            raise ValidationError({'kind': 'لا يمكن تغيير نوع السجل.'})
        data = attrs.get('data', getattr(self.instance, 'data', {}))
        if not isinstance(data, dict):
            raise ValidationError({'data': 'بيانات السجل غير صالحة.'})
        if self.instance and session != self.instance.session:
            raise ValidationError({'session': 'لا يمكن نقل السجل إلى جلسة أخرى.'})
        if kind == 'prescription':
            validator = MedicationSerializer(data=data.get('medications', []), many=True, allow_empty=False)
            validator.is_valid(raise_exception=True)
            for medication in validator.validated_data:
                start, end = medication.get('start_date'), medication.get('end_date')
                if start and end and end < start:
                    raise ValidationError({'medications': 'نهاية الدواء لا يمكن أن تسبق بدايته.'})
        if kind == 'alert' and data.get('category') not in (
                'allergy', 'condition', 'adverse_reaction', 'pregnancy', 'behavior', 'other'):
            raise ValidationError({'data': 'حدد نوع التنبيه الطبي.'})
        if kind == 'vaccine':
            due = data.get('next_due_date')
            if due:
                due = serializers.DateField().run_validation(due)
                given = attrs.get('date', getattr(self.instance, 'date', None))
                if given and due < given:
                    raise ValidationError({'next_due_date': 'الجرعة القادمة يجب ألا تسبق تاريخ التطعيم.'})
            certificate = data.get('document_id')
            if certificate and not patient.documents.filter(pk=certificate).exists():
                raise ValidationError({'document_id': 'المرفق لا ينتمي لهذا المريض.'})
        record_date = attrs.get('date', getattr(self.instance, 'date', None))
        if record_date and record_date > timezone.localdate():
            raise ValidationError({'date': 'لا يمكن تسجيل إجراء مكتمل بتاريخ مستقبلي.'})
        return attrs


def profile_medical(patient, request):
    editable = can_write_clinical(request.user, patient.clinic)
    visits = appointments_for(patient)
    completed = visits.filter(status__in=['COMPLETED', 'completed'])
    latest = completed.first()
    sessions = VeterinarySession.objects.filter(appointment__in=visits).order_by('-session_date', '-id')
    active = sessions.filter(session_ended_at__isnull=True,
                             appointment__status='IN_SESSION').first()
    entries = list(patient.medical_entries.all())
    vaccines = [MedicalEntrySerializer(e).data for e in entries if e.kind == 'vaccine' and e.is_active]
    prescriptions = [MedicalEntrySerializer(e).data for e in entries if e.kind == 'prescription' and e.is_active]
    alerts = [dict(id=e.id, title=e.title, message=e.data.get('notes', ''),
                   type=e.data.get('category'), severity=e.data.get('severity', 'warning'),
                   is_active=True) for e in entries if e.kind == 'alert' and e.is_active]
    medications = [dict(m, prescription_id=p['id'], prescribing_veterinarian=p['data'].get('veterinarian', ''))
                   for p in prescriptions for m in p['data'].get('medications', [])]
    weight, weight_date = patient.weight_kg, patient.weight_recorded_at
    for session in sessions.filter(session_ended_at__isnull=False):
        measured = session.vitals.get('weight', {})
        if isinstance(measured, dict) and measured.get('value') not in ('', None):
            if not weight_date or session.session_date >= weight_date:
                weight, weight_date = measured['value'], session.session_date
            break
    latest_vaccines = {}
    for vaccine in vaccines:
        latest_vaccines.setdefault(vaccine['title'].strip().casefold(), vaccine)
    next_visit = visits.filter(status__in=['ACCEPTED', 'PENDING'],
        scheduled_date__gte=timezone.localdate()).order_by('scheduled_date', 'scheduled_time').first()
    from .serializers import ClinicAppointmentSerializer
    return {
        'microchip_number': patient.microchip_number,
        'owner_id': patient.owner_id,
        'medical_alerts': alerts, 'medications': medications,
        'structured_vaccinations': vaccines,
        'active_session_id': active.id if active else None,
        'upcoming_appointment': ClinicAppointmentSerializer(next_visit).data if next_visit else None,
        'medical_summary': {'visit_count': completed.count(),
            'last_visit': record_for(latest, request) if latest else None,
            'weight': str(weight) if weight is not None else None,
            'weight_date': weight_date,
            'next_vaccine_due': min([v['data']['next_due_date'] for v in latest_vaccines.values()
                                    if v['data'].get('next_due_date')], default=None)},
        'permissions': {'can_edit_patient': True, 'can_add_medical_record': editable,
                        'can_edit_session': editable, 'can_add_note': editable,
                        'can_upload_document': editable},
    }


class MedicalPatientMixin:
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        from django.db.models import CharField, F, Value
        from django.db.models.functions import Cast, Coalesce, Concat, Replace
        patient = self.get_object()
        editable = can_write_clinical(request.user, patient.clinic)
        category = request.query_params.get('kind')
        search = request.query_params.get('search', '').strip()
        visits = appointments_for(patient).filter(status__in=['COMPLETED', 'completed', 'IN_SESSION']).annotate(
            history_date=Coalesce('session__session_date', 'scheduled_date'))
        entries = patient.medical_entries.exclude(kind='alert')
        notes = patient.profile_notes.all()
        if category:
            if category != 'visit':
                visits = visits.none()
            entries = entries.filter(kind=category)
            if category != 'note':
                notes = notes.none()
        if search:
            matching_types = [key for key, label in VeterinaryAppointment.APPOINTMENT_TYPE_CHOICES
                              if search.casefold() in label.casefold()]
            visit_search = Q(appointment_type__in=matching_types)
            for field in ('reason', 'diagnosis', 'treatment', 'notes', 'clinic__name',
                          'session__main_complaint', 'session__symptoms', 'session__care_provider_name',
                          'session__allergies', 'session__doctor_notes', 'session__physical_exam_notes',
                          'session__home_care_instructions', 'session__services_performed',
                          'session__owner_notes', 'session__previous_treatment', 'session__current_medications',
                          'session__provisional_diagnosis', 'session__lab_tests_requested',
                          'session__imaging_requested', 'session__food_instructions', 'session__warning_signs'):
                visit_search |= Q(**{field + '__icontains': search})
            visits = visits.annotate(history_search=Concat(
                Cast('session__medications', CharField()), Value(' '), Cast('session__vitals', CharField()),
                Value(' '), Cast('session__physical_exam', CharField()), Value(' '), Cast('session__attachments', CharField())))
            visits = visits.filter(visit_search | Q(history_search__icontains=search))
            entries = entries.annotate(history_search=Cast('data', CharField())).filter(
                Q(title__icontains=search) | Q(history_search__icontains=search))
            notes = notes.filter(Q(text__icontains=search) | Q(created_by__first_name__icontains=search)
                                 | Q(created_by__last_name__icontains=search))
        for key, lookup in [('date_from', 'gte'), ('date_to', 'lte')]:
            raw = request.query_params.get(key)
            if raw:
                value = serializers.DateField().run_validation(raw)
                visits = visits.filter(**{'history_date__' + lookup: value})
                entries = entries.filter(**{'date__' + lookup: value})
                notes = notes.filter(**{'created_at__date__' + lookup: value})
        visit_refs = visits.order_by().annotate(history_kind=Value('visit', output_field=CharField()),
            occurred_at=Concat(Cast('history_date', CharField()), Value('T'), Cast('scheduled_time', CharField()))
        ).values('id', 'history_kind', 'occurred_at')
        entry_refs = entries.order_by().annotate(history_kind=F('kind'),
            occurred_at=Concat(Cast('date', CharField()), Value('T00:00:00'))
        ).values('id', 'history_kind', 'occurred_at')
        note_refs = notes.order_by().annotate(history_kind=Value('note', output_field=CharField()),
            occurred_at=Replace(Cast('created_at', CharField()), Value(' '), Value('T'))
        ).values('id', 'history_kind', 'occurred_at')
        refs = visit_refs.union(entry_refs, note_refs).order_by('-occurred_at', '-history_kind', '-id')
        paginator = PageNumberPagination()
        paginator.page_size = 25
        page = paginator.paginate_queryset(refs, request)
        visit_map = appointments_for(patient).filter(pk__in=[r['id'] for r in page if r['history_kind'] == 'visit']).in_bulk()
        entry_map = patient.medical_entries.filter(pk__in=[r['id'] for r in page if r['history_kind'] in ('vaccine', 'prescription')]).in_bulk()
        note_map = patient.profile_notes.select_related('created_by').filter(pk__in=[r['id'] for r in page if r['history_kind'] == 'note']).in_bulk()
        items = []
        for ref in page:
            kind, pk = ref['history_kind'], ref['id']
            if kind == 'visit':
                record = record_for(visit_map[pk], request)
                items.append(dict(id=f'visit-{pk}', kind=kind, date=record['date'], title=record['title'],
                    record=record, can_edit=editable, session_id=record['session_id'], appointment_id=pk))
            elif kind == 'note':
                note = note_map[pk]
                items.append(dict(id=f'note-{pk}', kind=kind, date=note.created_at.isoformat(),
                    title='ملاحظة فريق العيادة', record={'text': note.text,
                    'author': note.created_by.get_full_name() if note.created_by else ''}, can_edit=False))
            else:
                entry = entry_map[pk]
                items.append(dict(id=f'{kind}-{pk}', kind=kind, date=str(entry.date), title=entry.title,
                    record=MedicalEntrySerializer(entry).data, can_edit=editable))
        return paginator.get_paginated_response(items)

    @action(detail=True, methods=['get', 'post'], url_path='medical-entries')
    def medical_entries(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'GET':
            entries = patient.medical_entries.all()
            if request.query_params.get('kind'):
                entries = entries.filter(kind=request.query_params['kind'])
            return Response(MedicalEntrySerializer(entries, many=True).data)
        require_clinical(request.user, patient.clinic)
        serializer = MedicalEntrySerializer(data=request.data, context={'patient': patient})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            entry = serializer.save(patient=patient, clinic=patient.clinic)
            self._sync_entry(entry)
            audit(request.user, patient.clinic, patient, entry.kind, entry.id, {}, serializer.data)
        return Response(serializer.data, status=201)

    @action(detail=True, methods=['patch'], url_path=r'medical-entries/(?P<entry_id>[^/.]+)')
    def edit_medical_entry(self, request, pk=None, entry_id=None):
        patient = self.get_object()
        require_clinical(request.user, patient.clinic)
        from django.shortcuts import get_object_or_404
        with transaction.atomic():
            entry = get_object_or_404(patient.medical_entries.select_for_update(), pk=entry_id)
            before = MedicalEntrySerializer(entry).data
            serializer = MedicalEntrySerializer(entry, data=request.data, partial=True, context={'patient': patient})
            serializer.is_valid(raise_exception=True)
            entry = serializer.save()
            self._sync_entry(entry)
            audit(request.user, patient.clinic, patient, entry.kind, entry.id, before, serializer.data)
        return Response(serializer.data)

    def _sync_entry(self, entry):
        if entry.kind == 'prescription' and entry.session_id:
            entry.session.medications = entry.data.get('medications', []) if entry.is_active else []
            entry.session.save(update_fields=['medications', 'updated_at'])

    @action(detail=True, methods=['get'])
    def amendments(self, request, pk=None):
        patient = self.get_object()
        queryset = patient.amendments.select_related('actor').all()
        if request.query_params.get('record_id'):
            queryset = queryset.filter(record_id=request.query_params['record_id'],
                record_kind=request.query_params.get('kind', 'session'))
        paginator = PageNumberPagination()
        paginator.page_size = 25
        page = paginator.paginate_queryset(queryset, request)
        return paginator.get_paginated_response([dict(id=a.id, kind=a.record_kind,
            record_id=a.record_id, before=a.before, after=a.after, created_at=a.created_at,
            actor=a.actor.get_full_name() or a.actor.email if a.actor else '') for a in page])

    @action(detail=True, methods=['get'], url_path='owner')
    def owner_detail(self, request, pk=None):
        patient = self.get_object()
        from .serializers import ClinicPatientRecordSerializer
        return Response({'id': patient.owner_id, 'name': patient.owner.full_name,
            'phone': patient.owner.phone, 'email': patient.owner.email,
            'linked_account': bool(patient.linked_user_id),
            'patients': ClinicPatientRecordSerializer(patient.owner.pets.filter(clinic=patient.clinic),
                many=True, context=self.get_serializer_context()).data})

    @action(detail=True, methods=['post'], url_path='start-visit')
    def start_visit(self, request, pk=None):
        from .serializers import VeterinarySessionSerializer, ClinicAppointmentSerializer
        patient = self.get_object()
        require_clinical(request.user, patient.clinic)
        with transaction.atomic():
            ClinicPatientRecord.objects.select_for_update().get(pk=patient.pk)
            visits = appointments_for(patient)
            active = VeterinarySession.objects.filter(appointment__in=visits,
                session_ended_at__isnull=True, appointment__status='IN_SESSION').first()
            if active:
                return Response(VeterinarySessionSerializer(active).data)
            appointment_id = request.data.get('appointment_id')
            if appointment_id:
                from django.shortcuts import get_object_or_404
                appointment = get_object_or_404(visits, pk=appointment_id)
                if appointment.status not in ['ACCEPTED', 'PENDING', 'IN_SESSION']:
                    raise ValidationError({'appointment_id': 'لا يمكن بدء جلسة لهذا الموعد.'})
            else:
                payload = {'clinic_patient': patient.id, 'appointment_type': request.data.get('appointment_type', 'checkup'),
                    'scheduled_date': timezone.localdate(), 'scheduled_time': timezone.localtime().time(),
                    'reason': request.data.get('reason', '').strip(), 'status': 'ACCEPTED'}
                serializer = ClinicAppointmentSerializer(data=payload, context=self.get_serializer_context())
                serializer.is_valid(raise_exception=True)
                appointment = serializer.save(clinic=patient.clinic)
            appointment.status = 'IN_SESSION'
            appointment.save(update_fields=['status', 'updated_at'])
            appointment.storefront_bookings.update(status='IN_SESSION')
            session, _ = VeterinarySession.objects.get_or_create(appointment=appointment, defaults={
                'clinic': patient.clinic, 'clinic_patient': patient, 'pet': patient.linked_pet,
                'owner': patient.linked_user, 'session_date': timezone.localdate(),
                'session_started_at': timezone.now(), 'care_provider_name': request.user.get_full_name(),
                'service_type': appointment.appointment_type, 'main_complaint': appointment.reason})
        return Response(VeterinarySessionSerializer(session).data)
