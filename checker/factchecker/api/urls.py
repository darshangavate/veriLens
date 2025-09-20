from django.urls import path
from .views import analyze

urlpatterns = [
    path("analyze/", analyze),
]
