"""Single Harness package: common contracts and internal brand implementations.

Brands are modules, not separately installed plugins. Historical Python import
names are compatibility aliases shipped by this same distribution.
"""
from .plugin import create_plugin

__all__ = ["create_plugin"]
