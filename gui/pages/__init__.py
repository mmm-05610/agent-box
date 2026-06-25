"""Top-level page views shown in the content area."""
from __future__ import annotations

from .detail import ProfileDetailPage
from .help import HelpPage
from .home import HomePage
from .library import LibraryPage
from .profiles import ProfileRow, ProfilesPage
from .sessions import SessionsPage
from .settings import SettingsPage
from .wizard import CreationWizard

__all__ = [
    "CreationWizard",
    "HelpPage",
    "HomePage",
    "LibraryPage",
    "ProfileDetailPage",
    "ProfileRow",
    "ProfilesPage",
    "SessionsPage",
    "SettingsPage",
]
