from django.core.management.base import BaseCommand
from django.db import transaction

from clinics.models import VeterinaryAppointment
from clinics.serializers import get_or_create_patient_record_for_pet


class Command(BaseCommand):
    help = 'Backfill clinic_patient links for appointments that only reference app pets.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist changes. Without this flag the command only reports what would change.',
        )
        parser.add_argument(
            '--clinic-id',
            type=int,
            help='Limit the backfill to one clinic id.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        clinic_id = options.get('clinic_id')
        queryset = (
            VeterinaryAppointment.objects
            .filter(clinic_patient__isnull=True, pet__isnull=False)
            .select_related('clinic', 'pet', 'pet__breed', 'owner', 'pet__owner')
            .order_by('clinic_id', 'pet_id', 'id')
        )
        if clinic_id:
            queryset = queryset.filter(clinic_id=clinic_id)

        checked = 0
        updated = 0
        created_or_reused = {}

        for appointment in queryset.iterator():
            checked += 1
            key = (appointment.clinic_id, appointment.pet_id)
            if not apply_changes:
                created_or_reused[key] = created_or_reused.get(key, 0) + 1
                continue

            with transaction.atomic():
                patient = get_or_create_patient_record_for_pet(
                    appointment.clinic,
                    appointment.pet,
                    appointment.owner,
                )
                if not patient:
                    continue
                VeterinaryAppointment.objects.filter(
                    pk=appointment.pk,
                    clinic_patient__isnull=True,
                ).update(clinic_patient=patient)
                updated += 1
                created_or_reused[key] = patient.id

        mode = 'applied' if apply_changes else 'dry-run'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode}: checked={checked} appointments, '
                f'updated={updated}, unique_pet_links={len(created_or_reused)}'
            )
        )
