from datetime import timedelta
from unittest.mock import patch

from google.api_core.exceptions import AlreadyExists

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from .models import Breed, BreedingRequest, ChatRoom, Notification, NotificationOutbox, Pet, Story, StoryReplyRequest, UserBlock


class StoryReplyApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='reply-owner', email='reply-owner@example.com', password='pass', phone='1111111111',
        )
        self.sender = User.objects.create_user(
            username='reply-sender', email='reply-sender@example.com', password='pass', phone='2222222222',
        )
        self.story = Story.objects.create(
            author=self.owner, image='stories/test.png', expires_at=timezone.now() + timedelta(hours=1),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.sender)

    def submit(self, key='reply-key-123', text='Hello'):
        return self.client.post(
            f'/api/pets/stories/{self.story.pk}/reply/',
            {'text': text, 'idempotency_key': key}, format='json',
        )

    def test_pending_creation_and_idempotent_retry(self):
        first = self.submit()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data['status'], 'pending')
        room = ChatRoom.objects.get(pk=first.data['chat_room_id'])
        self.assertFalse(room.is_active)
        self.assertEqual(self.submit().data['id'], first.data['id'])
        self.assertEqual(StoryReplyRequest.objects.count(), 1)
        self.assertEqual(NotificationOutbox.objects.filter(event_type='story_reply_received').count(), 1)
        self.assertEqual(self.submit(key='other-key-123').status_code, 409)

    def test_pending_request_appears_in_chat_list_and_request_center(self):
        reply_id = self.submit().data['id']
        self.client.force_authenticate(self.owner)
        chat_response = self.client.get('/api/pets/chat/rooms/')
        self.assertEqual(chat_response.status_code, 200)
        pending_rooms = [row for row in chat_response.data['results'] if row.get('story_reply_status') == 'pending']
        self.assertEqual(len(pending_rooms), 1)
        self.assertFalse(pending_rooms[0]['is_active'])
        cards = self.client.get('/api/pets/request-center/').data['results']
        self.assertTrue(any(card['kind'] == 'story_reply' and card['object_id'] == reply_id for card in cards))

    def test_accept_and_reject_are_idempotent_and_exclusive(self):
        reply_id = self.submit().data['id']
        self.client.force_authenticate(self.owner)
        url = f'/api/pets/story-replies/{reply_id}/accept/'
        self.assertEqual(self.client.post(url).data['status'], 'approved')
        self.assertEqual(self.client.post(url).data['status'], 'approved')
        self.assertEqual(self.client.post(f'/api/pets/story-replies/{reply_id}/reject/').status_code, 409)
        self.assertTrue(ChatRoom.objects.get(story_reply_request_id=reply_id).is_active)
        self.assertEqual(NotificationOutbox.objects.filter(event_type='story_reply_approved').count(), 1)

    def test_rejection_stops_later_requests(self):
        reply_id = self.submit().data['id']
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'/api/pets/story-replies/{reply_id}/reject/').data['status'], 'rejected')
        self.client.force_authenticate(self.sender)
        self.assertEqual(self.submit(key='other-key-123').status_code, 409)

    def test_self_reply_and_disabled_or_expired_story(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.submit().status_code, 400)
        self.client.force_authenticate(self.sender)
        self.story.allow_replies = False
        self.story.save(update_fields=['allow_replies'])
        self.assertEqual(self.submit().status_code, 403)
        self.story.allow_replies = True
        self.story.expires_at = timezone.now() - timedelta(seconds=1)
        self.story.save(update_fields=['allow_replies', 'expires_at'])
        self.assertEqual(self.submit().status_code, 404)
        self.assertEqual(self.client.get(f'/api/pets/stories/{self.story.pk}/preview/').status_code, 404)

    def test_block_is_bidirectional_and_unblock_restores_visibility(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'/api/pets/users/{self.sender.pk}/block/').status_code, 200)
        self.client.force_authenticate(self.sender)
        self.assertEqual(self.submit().status_code, 404)
        story_data = self.client.get('/api/pets/stories/').data
        self.assertEqual(story_data.get('results', []) if isinstance(story_data, dict) else story_data, [])
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(f'/api/pets/users/{self.sender.pk}/block/').status_code, 200)
        self.assertFalse(UserBlock.objects.exists())

    def test_home_digest_uses_blocked_story_visibility(self):
        before = self.client.get('/api/pets/home/digest/')
        self.assertEqual(before.status_code, 200)
        self.assertTrue(any(item['id'] == self.story.pk for module in before.data['modules']
                            if module['key'] == 'active_stories' for item in module['items']))
        UserBlock.objects.create(blocker=self.owner, blocked=self.sender)
        after = self.client.get('/api/pets/home/digest/')
        self.assertEqual(after.status_code, 200)
        self.assertFalse(any(item['id'] == self.story.pk for module in after.data['modules']
                             if module['key'] == 'active_stories' for item in module['items']))

    def test_reuses_only_an_approved_active_chat(self):
        breed = Breed.objects.create(name='Reply breed', pet_type='cats')
        target = Pet.objects.create(
            owner=self.owner, name='Target', pet_type='cats', breed=breed,
            age_months=8, gender='F', description='Target', main_image='pets/target.png',
            status='available', location='Cairo', is_free=True,
        )
        requester_pet = Pet.objects.create(
            owner=self.sender, name='Sender', pet_type='cats', breed=breed,
            age_months=9, gender='M', description='Sender', main_image='pets/sender.png',
            status='available', location='Cairo', is_free=True,
        )
        breeding = BreedingRequest.objects.create(
            target_pet=target, requester_pet=requester_pet, requester=self.sender,
            receiver=self.owner, contact_phone='2222222222', status='pending',
        )
        existing_room = ChatRoom.objects.create(breeding_request=breeding)
        first = self.submit()
        self.assertEqual(first.data['status'], 'pending')
        self.assertNotEqual(first.data['chat_room_id'], existing_room.pk)
        self.client.force_authenticate(self.owner)
        self.client.post(f'/api/pets/story-replies/{first.data["id"]}/reject/')
        self.client.force_authenticate(self.sender)
        # A fresh pair can reuse the now-approved breeding room.
        other_owner = User.objects.create_user(
            username='reply-owner-2', email='reply-owner-2@example.com', password='pass', phone='3333333333',
        )
        target.owner = other_owner
        target.save(update_fields=['owner'])
        breeding.receiver = other_owner
        breeding.status = 'approved'
        breeding.save(update_fields=['receiver', 'status'])
        other_story = Story.objects.create(author=other_owner, image='stories/other.png', expires_at=timezone.now() + timedelta(hours=1))
        result = self.client.post(f'/api/pets/stories/{other_story.pk}/reply/', {
            'text': 'Hello again', 'idempotency_key': 'other-story-key-123',
        }, format='json')
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data['status'], 'approved')
        self.assertEqual(result.data['chat_room_id'], existing_room.pk)
        self.assertTrue(result.data['reused_chat'])

    def test_new_request_limit_is_five_per_day(self):
        for index in range(5):
            owner = User.objects.create_user(
                username=f'limit-owner-{index}', email=f'limit-owner-{index}@example.com',
                password='pass', phone=f'33333333{index:02d}',
            )
            story = Story.objects.create(author=owner, image=f'stories/{index}.png', expires_at=timezone.now() + timedelta(hours=1))
            result = self.client.post(f'/api/pets/stories/{story.pk}/reply/', {
                'text': 'Hello', 'idempotency_key': f'limit-key-{index}-123',
            }, format='json')
            self.assertEqual(result.status_code, 201)
        owner = User.objects.create_user(username='limit-owner-6', email='limit-owner-6@example.com', password='pass', phone='4444444444')
        story = Story.objects.create(author=owner, image='stories/limit.png', expires_at=timezone.now() + timedelta(hours=1))
        result = self.client.post(f'/api/pets/stories/{story.pk}/reply/', {
            'text': 'Hello', 'idempotency_key': 'limit-key-six-123',
        }, format='json')
        self.assertEqual(result.status_code, 429)

    @patch('pets.story_reply_delivery.deliver_outbox_notification_push')
    def test_request_notification_is_deduplicated_without_reply_text(self, push):
        from .story_reply_delivery import process_story_reply_received
        reply_id = self.submit(text='Private reply body').data['id']
        process_story_reply_received(reply_id, {})
        process_story_reply_received(reply_id, {})
        notifications = Notification.objects.filter(type='story_reply_received', user=self.owner)
        self.assertEqual(notifications.count(), 1)
        self.assertNotIn('Private reply body', notifications.first().message)
        push.assert_called_once()

    @patch('pets.story_reply_delivery.create_notification_once', return_value=(None, False))
    @patch('pets.story_reply_delivery.firestore.client')
    @patch('pets.story_reply_delivery.sync_room_permissions')
    def test_firestore_initial_message_uses_deterministic_id(self, sync, client, create_notification):
        from .story_reply_delivery import process_story_reply_approved
        reply_id = self.submit().data['id']
        self.client.force_authenticate(self.owner)
        self.client.post(f'/api/pets/story-replies/{reply_id}/accept/')
        message_ref = client.return_value.collection.return_value.document.return_value.collection.return_value.document.return_value
        message_ref.create.side_effect = [None, AlreadyExists('already exists')]
        process_story_reply_approved(reply_id, {})
        process_story_reply_approved(reply_id, {})
        self.assertEqual(message_ref.create.call_count, 2)
        self.assertEqual(client.return_value.collection.return_value.document.return_value.collection.return_value.document.call_args.args, (f'story_reply_{reply_id}',))
        self.assertEqual(create_notification.call_count, 2)
        self.assertEqual(sync.call_count, 2)

    def test_owner_only_response_and_authentication(self):
        reply_id = self.submit().data['id']
        self.assertEqual(self.client.post(f'/api/pets/story-replies/{reply_id}/accept/').status_code, 404)
        self.client.force_authenticate(user=None)
        self.assertIn(self.submit().status_code, {401, 403})
