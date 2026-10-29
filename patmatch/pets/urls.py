from django.urls import path
from . import views
from .availability_views import AvailabilityChecksView, PetAvailabilityView
from . import sharing, story_replies

app_name = 'pets'

urlpatterns = [
    path('public/<int:pet_id>/', sharing.public_pet, name='public-pet-share'),
    path('public/<int:pet_id>/shares/<uuid:share_id>/', sharing.public_share, name='public-pet-share-session'),
    path('public/<int:pet_id>/shares/<uuid:share_id>/open/', sharing.record_public_share_open, name='public-pet-share-open'),
    path('referrals/claim/', sharing.claim_referral_view, name='claim-referral'),
    path('referrals/summary/', sharing.referral_summary, name='referral-summary'),
    path('referrals/wallet/', sharing.referral_wallet, name='referral-wallet'),
    path('share-assets/<uuid:asset_id>/', sharing.share_asset, name='pet-share-asset'),
    path('<int:pet_id>/shares/', sharing.create_share, name='pet-create-share'),
    path('<int:pet_id>/shares/<uuid:share_id>/', sharing.share_status, name='pet-share-status'),
    path('<int:pet_id>/shares/<uuid:share_id>/assets/', sharing.request_asset, name='pet-share-request-asset'),
    # السلالات
    path('breeds/', views.BreedListView.as_view(), name='breed-list'),
    
    # الحيوانات
    path('', views.PetListCreateView.as_view(), name='pet-list-create'),
    path('map/markers/', views.PetMapMarkersView.as_view(), name='pet-map-markers'),
    path('stories/', views.StoryListCreateView.as_view(), name='story-list-create'),
    path('stories/<int:story_id>/reply/', story_replies.reply_to_story, name='story-reply'),
    path('stories/<int:story_id>/preview/', story_replies.story_preview, name='story-reply-preview'),
    path('story-replies/<int:reply_id>/<str:action>/', story_replies.respond_to_story_reply, name='story-reply-respond'),
    path('users/<int:user_id>/block/', story_replies.block_user, name='user-block'),
    path('users/blocks/', story_replies.blocked_users, name='blocked-users'),
    path('chat/firebase-token/', story_replies.firebase_token, name='firebase-token'),
    path('stories/my/', views.MyStoriesView.as_view(), name='my-stories'),
    path('stories/<int:pk>/', views.StoryDeleteView.as_view(), name='story-delete'),
    path('stories/<int:story_id>/view/', views.mark_story_viewed, name='story-view'),
    path('stories/<int:story_id>/react/', views.react_to_story, name='story-react'),
    path('stories/<int:story_id>/reactions/', views.story_reactions, name='story-reactions'),
    path('stories/<int:story_id>/report/', views.report_story, name='story-report'),
    path('request-center/', views.RequestCenterView.as_view(), name='request-center'),
    path('saved-searches/', views.SavedSearchListCreateView.as_view(), name='saved-search-list-create'),
    path('saved-searches/preview/', views.UnsavedSearchPreviewView.as_view(), name='saved-search-preview-unsaved'),
    path('saved-searches/<int:pk>/', views.SavedSearchDetailView.as_view(), name='saved-search-detail'),
    path('saved-searches/<int:pk>/preview/', views.SavedSearchPreviewView.as_view(), name='saved-search-preview'),
    path('home/digest/', views.HomeDigestView.as_view(), name='home-digest'),
    path('<int:pk>/', views.PetDetailView.as_view(), name='pet-detail'),
    path('availability-checks/', AvailabilityChecksView.as_view(), name='availability-checks'),
    path('<int:pk>/availability/', PetAvailabilityView.as_view(), name='pet-availability'),
    path('my/', views.MyPetsView.as_view(), name='my-pets'),
    path('engagement-events/', views.create_engagement_event, name='engagement-events'),
    
    # العيادات البيطرية
    path('veterinary-clinics/', views.VeterinaryClinicListView.as_view(), name='veterinary-clinic-list'),
    
    # طلبات المقابلة
    path('breeding-requests/', views.BreedingRequestListCreateView.as_view(), name='breeding-request-list-create'),
    path('breeding-requests/<int:pk>/', views.BreedingRequestDetailView.as_view(), name='breeding-request-detail'),
    path('breeding-requests/<int:request_id>/respond/', views.respond_to_breeding_request, name='respond-breeding-request'),
    path('breeding-requests/my/', views.my_breeding_requests, name='my-breeding-requests'),
    path('breeding-requests/received/', views.received_breeding_requests, name='received-breeding-requests'),
    
    # الإشعارات
    path('notifications/', views.NotificationListView.as_view(), name='notification-list'),
    path('notifications/<int:notification_id>/mark-read/', views.mark_notification_as_read, name='mark-notification-read'),
    path('notifications/mark-all-read/', views.mark_all_notifications_as_read, name='mark-all-notifications-read'),
    path('notifications/unread-count/', views.get_unread_notifications_count, name='unread-notifications-count'),
    path('notifications/mark-chat-read/', views.mark_chat_notifications_as_read, name='mark-chat-notifications-read'),
    path('notifications/chat-message/', views.send_chat_message_notification, name='send-chat-message-notification'),
    path('notifications/preferences/', views.notification_preferences, name='notification-preferences'),
    path('notifications/events/', views.create_notification_interaction_event, name='notification-events'),
    
    # المفضلات
    path('favorites/', views.FavoriteListCreateView.as_view(), name='favorite-list-create'),
    path('favorites/<int:pk>/', views.FavoriteDetailView.as_view(), name='favorite-detail'),
    path('<int:pet_id>/toggle-favorite/', views.toggle_favorite, name='toggle-favorite'),
    path('<int:pet_id>/toggle-like/', views.toggle_pet_like, name='toggle-pet-like'),
    
    # إحصائيات
    path('stats/', views.pet_stats, name='pet-stats'),
    
    # إدارة القطط (للمشرفين فقط)
    path('admin/cats/', views.cats_summary, name='cats-summary'),
    path('admin/cats/delete/', views.delete_cats, name='delete-cats'),
    path('admin/cats/delete/<str:breed_name>/', views.delete_cats_by_breed, name='delete-cats-by-breed'),
    
    # Chat URLs
    path('chat/rooms/', views.chat_rooms, name='chat-rooms'),
    path('chat/rooms/archived/', views.archived_chat_rooms, name='archived-chat-rooms'),
    path('chat/rooms/<int:chat_id>/', views.chat_room_detail, name='chat-room-detail'),
    path('chat/rooms/<int:chat_id>/context/', views.chat_room_context, name='chat-room-context'),
    path('chat/firebase/<str:firebase_chat_id>/', views.chat_room_by_firebase_id, name='chat-room-by-firebase-id'),
    path('chat/breeding-request/<int:breeding_request_id>/', views.chat_room_by_breeding_request, name='chat-room-by-breeding-request'),
    path('chat/adoption-request/<int:adoption_request_id>/', views.chat_room_by_adoption_request, name='chat-room-by-adoption-request'),
    path('chat/create/', views.create_chat_room, name='create-chat-room'),
    path('chat/rooms/<int:chat_id>/archive/', views.archive_chat_room, name='archive-chat-room'),
    path('chat/rooms/<int:chat_id>/reactivate/', views.reactivate_chat_room, name='reactivate-chat-room'),
    path('chat/rooms/<int:chat_id>/status/', views.chat_room_status, name='chat-room-status'),
    path('chat/user-status/', views.user_chat_status, name='user-chat-status'),
    path('chat/upload-image/', views.upload_chat_image, name='upload-chat-image'),
    
    # Adoption URLs
    path('adoption/', views.AdoptionRequestListCreateView.as_view(), name='adoption-request-list-create'),
    path('adoption/<int:pk>/', views.AdoptionRequestDetailView.as_view(), name='adoption-request-detail'),
    path('adoption/my/', views.MyAdoptionRequestsView.as_view(), name='my-adoption-requests'),
    path('adoption/received/', views.ReceivedAdoptionRequestsView.as_view(), name='received-adoption-requests'),
    path('adoption/<int:request_id>/respond/', views.respond_to_adoption_request, name='respond-adoption-request'),
    path('adoption/pets/', views.adoption_pets, name='adoption-pets'),
    path('adoption/stats/', views.adoption_stats, name='adoption-stats'),
] 
