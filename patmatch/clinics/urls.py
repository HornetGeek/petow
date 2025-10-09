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
    ClinicPatientViewSet,
    VeterinariansView,
    ClinicRecipientGroupsView,
    ClinicNotificationTemplatesView,
    ClinicBroadcastView,
    ClinicInviteListView,
    ClinicInviteRespondView,
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
    path('messages/broadcast/', ClinicBroadcastView.as_view(), name='clinic-broadcast'),
    path('invites/', ClinicInviteListView.as_view(), name='clinic-invites'),
    path('invites/<str:token>/<str:action>/', ClinicInviteRespondView.as_view(), name='clinic-invite-respond'),
    path('', include(router.urls)),
]
