from django.urls import path
from .views import analyze, extract_text, sources

urlpatterns = [
    path("analyze/", analyze),
    path("extract_text/", extract_text, name="extract_text"),  # 👈 ADD THIS
    path("sources/", sources),
]

