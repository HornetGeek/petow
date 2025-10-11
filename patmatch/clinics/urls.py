from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ClinicRegisterView,
    ClinicLoginView,
    ClinicDashboardOverviewView,
    ClinicClientsView,
    ClinicSettingsView,
    ClinicAppointmentViewSet,
    ClinicServiceViewSet,
    ClinicPromotionViewSet,
    ClinicMessageViewSet,
    ClinicMessageSendPushView,
    ClinicPatientViewSet,
    VeterinariansView,
    ClinicRecipientGroupsView,
    ClinicNotificationTemplatesView,
    ClinicBroadcastView,
    ClinicBroadcastStatsView,
    ClinicInviteListView,
    ClinicInviteRespondView,
    OwnerLookupView,
    PublicUserPetsView,
    PrepareInviteView,
)

router = DefaultRouter()
router.register(r'appointments', ClinicAppointmentViewSet, basename='clinic-appointments')
router.register(r'services', ClinicServiceViewSet, basename='clinic-services')
router.register(r'promotions', ClinicPromotionViewSet, basename='clinic-promotions')
router.register(r'messages', ClinicMessageViewSet, basename='clinic-messages')
router.register(r'patients', ClinicPatientViewSet, basename='clinic-patients')

urlpatterns = [
    path('register/', ClinicRegisterView.as_view(), name='clinic-register'),
    path('login/', ClinicLoginView.as_view(), name='clinic-login'),
    path('dashboard/', ClinicDashboardOverviewView.as_view(), name='clinic-dashboard'),
    path('clients/', ClinicClientsView.as_view(), name='clinic-clients'),
    path('settings/', ClinicSettingsView.as_view(), name='clinic-settings'),
    path('veterinarians/<int:pk>/', VeterinariansView.as_view(), name='clinic-veterinarian-detail'),
    path('veterinarians/', VeterinariansView.as_view(), name='clinic-veterinarians'),
    path('recipient-groups/', ClinicRecipientGroupsView.as_view(), name='clinic-recipient-groups'),
    path('notification-templates/', ClinicNotificationTemplatesView.as_view(), name='clinic-notification-templates'),
    path('broadcast-stats/', ClinicBroadcastStatsView.as_view(), name='clinic-broadcast-stats'),
    path('messages/<int:message_id>/send-push/', ClinicMessageSendPushView.as_view(), name='clinic-message-send-push'),
    path('messages/broadcast/', ClinicBroadcastView.as_view(), name='clinic-broadcast'),
    path('invites/', ClinicInviteListView.as_view(), name='clinic-invites'),
    path('invites/<str:token>/<str:action>/', ClinicInviteRespondView.as_view(), name='clinic-invite-respond'),
    # Owner lookup and pets preview
    path('owner-lookup/', OwnerLookupView.as_view(), name='clinic-owner-lookup'),
    path('users/<int:user_id>/pets/public/', PublicUserPetsView.as_view(), name='clinic-user-public-pets'),
    path('patients/prepare-invite/', PrepareInviteView.as_view(), name='clinic-patient-prepare-invite'),
    path('', include(router.urls)),
]
