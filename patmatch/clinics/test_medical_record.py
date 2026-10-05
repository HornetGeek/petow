from datetime import date, time
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from clinics.models import (Clinic, ClinicStaff, ClinicClientRecord, ClinicPatientRecord,
                            VeterinaryAppointment, VeterinarySession, ClinicMedicalEntry, ClinicalAmendment)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class PatientMedicalRecordTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='medical-vet', email='vet@example.com', user_type='clinic_staff')
        self.clinic = Clinic.objects.create(owner=self.user, name='Medical Clinic', address='Cairo', phone='01000000000', opening_hours='9-5', services='Care')
        ClinicStaff.objects.create(user=self.user, clinic=self.clinic, role='owner', is_primary=True)
        self.owner = ClinicClientRecord.objects.create(clinic=self.clinic, full_name='Owner', phone='01010000000', email='owner@example.com')
        self.patient = ClinicPatientRecord.objects.create(clinic=self.clinic, owner=self.owner, name='Milo', species='cats')
        self.client.force_authenticate(self.user)

    def patient_url(self, action):
        return f'/api/clinics/patients/{self.patient.pk}/{action}/'

    def appointment(self, **kwargs):
        data = dict(clinic=self.clinic, clinic_patient=self.patient, scheduled_date=date(2026, 1, 1), scheduled_time=time(10), appointment_type='checkup', status='COMPLETED', reason='Reason')
        data.update(kwargs)
        return VeterinaryAppointment.objects.create(**data)

    def session(self, **kwargs):
        appointment = self.appointment()
        data = dict(appointment=appointment, clinic=self.clinic, clinic_patient=self.patient,
                    session_date=appointment.scheduled_date, session_started_at=timezone.now(), session_ended_at=timezone.now(),
                    service_type='checkup', main_complaint='Reason', physical_exam_notes='Exam', diagnosis='Diagnosis',
                    services_performed='Treatment', home_care_instructions='Instructions', vitals={'weight': {'status':'not_checked'}})
        data.update(kwargs)
        return VeterinarySession.objects.create(**data)

    def test_history_is_complete_paginated_searchable_and_deduplicated(self):
        for i in range(32):
            self.appointment(scheduled_time=time(10, i), reason=f'visit-{i}')
        response = self.client.get(self.patient_url('history'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 32)
        self.assertEqual(len(response.data['results']), 25)
        second = self.client.get(response.data['next'])
        self.assertEqual(len(second.data['results']), 7)
        found = self.client.get(self.patient_url('history'), {'search': 'visit-0'})
        self.assertEqual(found.data['count'], 1)

    def test_history_rejects_invalid_date_filters(self):
        response = self.client.get(self.patient_url('history'), {'date_from': 'invalid'})
        self.assertEqual(response.status_code, 400)

    def test_full_session_fields_are_exposed(self):
        session = self.session(medications=[{'medicine_name': 'A'}, {'medicine_name': 'B'}], allergies='Penicillin')
        response = self.client.get(self.patient_url('history'))
        record = response.data['results'][0]['record']
        self.assertEqual(record['session_id'], session.id)
        self.assertEqual(record['allergies'], 'Penicillin')
        self.assertEqual(len(record['medications']), 2)

    def test_edit_completed_session_updates_appointment_and_audit(self):
        session = self.session()
        ended = session.session_ended_at
        response = self.client.patch(f'/api/clinics/sessions/{session.pk}/', {'diagnosis': 'Corrected', 'scheduled_date': '2026-02-02', 'scheduled_time': '14:15', 'appointment_type': 'follow-up'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        session.refresh_from_db(); session.appointment.refresh_from_db()
        self.assertEqual(session.session_ended_at, ended)
        self.assertEqual(session.appointment.diagnosis, 'Corrected')
        self.assertEqual(session.appointment.scheduled_time, time(14, 15))
        self.assertEqual(session.appointment.scheduled_date, date(2026, 2, 2))
        self.assertEqual(session.appointment.appointment_type, 'follow-up')
        self.assertEqual(session.appointment.status, 'COMPLETED')
        self.assertEqual(ClinicalAmendment.objects.filter(record_kind='session', record_id=str(session.pk)).count(), 1)
        profile = self.client.get(self.patient_url('profile'))
        self.assertEqual(profile.data['medical_summary']['last_visit']['diagnosis'], 'Corrected')

    def test_prescription_update_preserves_unknown_data_and_other_medications(self):
        medications=[{'medicine_name':'A', 'custom':'keep'}, {'medicine_name':'B'}]
        session=self.session(medications=medications)
        response=self.client.patch(f'/api/clinics/sessions/{session.pk}/', {'doctor_notes':'Edited'}, format='json')
        self.assertEqual(response.status_code,200, response.data)
        session.refresh_from_db()
        self.assertEqual(session.medications, medications)
        self.assertEqual(ClinicMedicalEntry.objects.get(session=session).data['medications'], medications)

    def test_legacy_visit_edit_does_not_create_session(self):
        appointment=self.appointment()
        response=self.client.patch(f'/api/clinics/appointments/{appointment.pk}/', {'diagnosis':'Corrected'}, format='json')
        self.assertEqual(response.status_code,200, response.data)
        self.assertFalse(VeterinarySession.objects.filter(appointment=appointment).exists())
        self.assertTrue(ClinicalAmendment.objects.filter(record_kind='appointment').exists())

    def test_patient_owner_edit_preserves_owner_and_linked_account(self):
        original=self.patient.owner_id
        response=self.client.patch(f'/api/clinics/patients/{self.patient.pk}/', {'owner_name':'New name', 'owner_email':'different@example.com', 'owner_phone':''}, format='json')
        self.assertEqual(response.status_code,200, response.data)
        self.patient.refresh_from_db(); self.owner.refresh_from_db()
        self.assertEqual(self.patient.owner_id, original)
        self.assertIsNone(self.patient.linked_user_id)
        self.assertEqual(self.owner.email, 'different@example.com')
        self.assertEqual(self.owner.phone, '')
        self.assertFalse(User.objects.filter(email='different@example.com').exists())

    def test_start_walkin_is_repeatable_and_resume_keeps_draft(self):
        first=self.client.post(self.patient_url('start-visit'), {'reason':'Vomiting'}, format='json')
        self.assertEqual(first.status_code,200, first.data)
        second=self.client.post(self.patient_url('start-visit'), {'reason':'Vomiting'}, format='json')
        self.assertEqual(second.data['id'],first.data['id'])
        self.assertEqual(VeterinaryAppointment.objects.count(),1)
        save=self.client.patch(f"/api/clinics/sessions/{first.data['id']}/", {'symptoms':'Draft'}, format='json')
        self.assertEqual(save.status_code,200, save.data)
        third=self.client.post(self.patient_url('start-visit'), {}, format='json')
        self.assertEqual(third.data['symptoms'],'Draft')
        self.assertEqual(self.client.get(self.patient_url('profile')).data['active_session_id'],first.data['id'])

    def test_reception_can_view_and_book_but_not_edit_clinical(self):
        reception=User.objects.create_user(username='reception',user_type='clinic_staff')
        ClinicStaff.objects.create(user=reception,clinic=self.clinic,role='reception',is_primary=True)
        session=self.session()
        self.client.force_authenticate(reception)
        self.assertFalse(self.client.get(self.patient_url('profile')).data['permissions']['can_edit_session'])
        self.assertEqual(self.client.patch(f'/api/clinics/sessions/{session.pk}/',{'diagnosis':'No'},format='json').status_code,403)
        self.assertEqual(self.client.post(self.patient_url('start-visit'),{'reason':'No'},format='json').status_code,403)
        self.assertEqual(self.client.patch(f'/api/clinics/appointments/{session.appointment_id}/',{'diagnosis':'No'},format='json').status_code,403)
        self.assertEqual(self.client.post(self.patient_url('medical-entries'),{'kind':'alert'},format='json').status_code,403)
        booking=self.client.post('/api/clinics/appointments/',{'clinic_patient':self.patient.pk,'appointment_type':'checkup','scheduled_date':'2026-11-01','scheduled_time':'15:00','reason':'Booking','status':'ACCEPTED'},format='json')
        self.assertEqual(booking.status_code,201, booking.data)
        self.assertEqual(self.client.patch(f"/api/clinics/appointments/{booking.data['id']}/", {'reason':'Updated booking'},format='json').status_code,200)

    def test_other_clinic_cannot_access_profile_or_history(self):
        other=User.objects.create_user(username='other',user_type='clinic_staff')
        Clinic.objects.create(owner=other,name='Other')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(self.patient_url('history')).status_code,404)
        self.assertEqual(self.client.get(self.patient_url('owner')).status_code,404)

    def test_summary_counts_completed_visits_only(self):
        self.appointment(); self.appointment(status='CANCELLED'); self.appointment(status='ACCEPTED')
        response=self.client.get(self.patient_url('profile'))
        self.assertEqual(response.data['medical_summary']['visit_count'],1)
        self.assertEqual(self.client.get(self.patient_url('history')).data['count'],1)

    def test_structured_vaccine_and_prescription_history(self):
        for data in [{'kind':'vaccine','title':'Rabies','date':'2026-01-01','data':{'next_due_date':'2027-01-01','batch_number':'LOT1'}}, {'kind':'prescription','title':'Rx','date':'2026-01-01','data':{'medications':[{'medicine_name':'A','status':'active'},{'medicine_name':'B','status':'unknown'}]}}]:
            response=self.client.post(self.patient_url('medical-entries'),data,format='json')
            self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.client.get(self.patient_url('history'),{'kind':'vaccine'}).data['count'],1)
        self.assertEqual(self.client.get(self.patient_url('profile')).data['medical_summary']['next_vaccine_due'],'2027-01-01')

    def test_alert_resolution_updates_header(self):
        entry=ClinicMedicalEntry.objects.create(clinic=self.clinic,patient=self.patient,kind='alert',title='Penicillin',date=date(2026,1,1),data={'category':'allergy'})
        self.assertEqual(len(self.client.get(self.patient_url('profile')).data['medical_alerts']),1)
        response=self.client.patch(self.patient_url(f'medical-entries/{entry.pk}'),{'is_active':False},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.client.get(self.patient_url('profile')).data['medical_alerts'],[])

    def test_end_completed_session_does_not_notify_again(self):
        session=self.session()
        with patch('clinics.views.VeterinarySessionViewSet._notify_owner_summary') as notify:
            response=self.client.post(f'/api/clinics/sessions/{session.pk}/end/',{},format='json')
        self.assertEqual(response.status_code,200,response.data)
        notify.assert_not_called()

    def test_session_patient_links_are_read_only(self):
        session=self.session()
        self.assertEqual(self.client.patch(f'/api/clinics/appointments/{session.appointment_id}/',{'clinic_patient':self.patient.pk},format='json').status_code,400)

    def test_future_completed_visit_date_rejected(self):
        session=self.session()
        response=self.client.patch(f'/api/clinics/sessions/{session.pk}/',{'scheduled_date':'2099-01-01'},format='json')
        self.assertEqual(response.status_code,400,response.data)

    def test_previous_visit_retries_do_not_create_duplicates(self):
        payload={'creation_key':'previous-visit-test-1','scheduled_date':'2026-01-01','scheduled_time':'10:00',
                 'main_complaint':'Checkup','physical_exam_notes':'Normal','diagnosis':'Healthy',
                 'services_performed':'Exam','home_care_instructions':'Observe','vitals':{'weight':{'status':'not_checked'}}}
        first=self.client.post(self.patient_url('sessions/complete'),payload,format='json')
        second=self.client.post(self.patient_url('sessions/complete'),payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(second.status_code,200,second.data)
        self.assertEqual(first.data['id'],second.data['id'])
        self.assertEqual(VeterinaryAppointment.objects.count(),1)

    def test_document_linked_to_session_is_returned_with_absolute_url(self):
        from clinics.models import ClinicPatientDocument
        session=self.session()
        document=ClinicPatientDocument.objects.create(clinic=self.clinic,patient=self.patient,session=session,title='Lab',file='clinics/lab.pdf')
        response=self.client.get(f'/api/clinics/sessions/{session.pk}/')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['attachments'][0]['id'],document.id)
        self.assertTrue(response.data['attachments'][0]['file_url'].startswith('http'))
        listing=self.client.get(self.patient_url('documents'))
        self.assertEqual(listing.data['count'],1)

    def test_newer_vaccine_replaces_old_due_date_in_summary(self):
        for given,due in [('2025-01-01','2026-01-01'),('2026-01-01','2027-01-01')]:
            ClinicMedicalEntry.objects.create(clinic=self.clinic,patient=self.patient,kind='vaccine',title='Rabies',date=given,data={'next_due_date':due})
        profile=self.client.get(self.patient_url('profile'))
        self.assertEqual(profile.data['medical_summary']['next_vaccine_due'],'2027-01-01')
        self.assertEqual(self.client.get(self.patient_url('history'),{'kind':'vaccine'}).data['count'],2)

    def test_prescription_cannot_reference_another_patient_session(self):
        session=self.session()
        other=ClinicPatientRecord.objects.create(clinic=self.clinic,owner=self.owner,name='Other',species='cats')
        response=self.client.post(f'/api/clinics/patients/{other.pk}/medical-entries/',{'kind':'prescription','title':'Rx','date':'2026-01-01','session':session.id,'data':{'medications':[{'medicine_name':'A'}]}},format='json')
        self.assertEqual(response.status_code,400,response.data)

    def test_owner_view_only_includes_this_owners_clinic_patients(self):
        ClinicPatientRecord.objects.create(clinic=self.clinic,owner=self.owner,name='Sibling',species='cats')
        other_owner=ClinicClientRecord.objects.create(clinic=self.clinic,full_name='Other')
        ClinicPatientRecord.objects.create(clinic=self.clinic,owner=other_owner,name='Unrelated',species='cats')
        response=self.client.get(self.patient_url('owner'))
        self.assertEqual({p['name'] for p in response.data['patients']},{'Milo','Sibling'})
