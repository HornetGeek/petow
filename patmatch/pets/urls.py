from django.urls import path
from . import views

app_name = 'pets'

urlpatterns = [
    # السلالات
    path('breeds/', views.BreedListView.as_view(), name='breed-list'),
    
    # الحيوانات
    path('', views.PetListCreateView.as_view(), name='pet-list-create'),
    path('<int:pk>/', views.PetDetailView.as_view(), name='pet-detail'),
    path('my/', views.MyPetsView.as_view(), name='my-pets'),
    
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
    path('notifications/chat-message/', views.send_chat_message_notification, name='send-chat-message-notification'),
    
    # المفضلات
    path('favorites/', views.FavoriteListCreateView.as_view(), name='favorite-list-create'),
    path('favorites/<int:pk>/', views.FavoriteDetailView.as_view(), name='favorite-detail'),
    path('<int:pet_id>/toggle-favorite/', views.toggle_favorite, name='toggle-favorite'),
    
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
