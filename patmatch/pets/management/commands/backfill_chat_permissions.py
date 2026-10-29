from django.core.management.base import BaseCommand
from pets.models import ChatRoom
from pets.story_reply_delivery import sync_room_permissions


class Command(BaseCommand):
    help = 'Write server-managed participant and status permissions for existing Firestore chat rooms.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0)

    def handle(self, *args, **options):
        rooms = ChatRoom.objects.select_related(
            'story_reply_request__sender', 'story_reply_request__owner',
            'breeding_request__requester', 'breeding_request__target_pet__owner',
            'adoption_request__adopter', 'adoption_request__pet__owner',
            'clinic_patient__linked_user', 'clinic_staff',
        ).order_by('id')
        if options['limit']:
            rooms = rooms[:options['limit']]
        total = 0
        for room in rooms.iterator():
            sync_room_permissions(room)
            total += 1
        self.stdout.write(self.style.SUCCESS(f'Synchronized {total} chat rooms'))
