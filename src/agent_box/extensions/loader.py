"""Discover trusted Python distributions and register their components."""
from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata
from typing import Iterable

from .. import __version__
from .. import config
from ..work_core.registry import ExtensionRegistry
from .api import (
    PLUGIN_API_VERSION,
    PluginContext,
    PluginDescriptor,
    PluginRegistration,
)


ENTRY_POINT_GROUP = "agent_box.plugins"


@dataclass(frozen=True)
class PluginLoadRecord:
    entry_point: str
    status: str
    descriptor: PluginDescriptor | None = None
    registration: PluginRegistration | None = None
    error: str | None = None
    distribution_name: str | None = None
    distribution_version: str | None = None


@dataclass(frozen=True)
class PluginLoadReport:
    records: tuple[PluginLoadRecord, ...]

    @property
    def ready(self) -> tuple[PluginLoadRecord, ...]:
        return tuple(record for record in self.records if record.status == "READY")

    @property
    def failed(self) -> tuple[PluginLoadRecord, ...]:
        return tuple(record for record in self.records if record.status != "READY")


def _entry_points() -> tuple[metadata.EntryPoint, ...]:
    discovered = metadata.entry_points()
    if hasattr(discovered, "select"):
        selected = discovered.select(group=ENTRY_POINT_GROUP)
    else:  # Python 3.9/importlib_metadata compatibility
        selected = discovered.get(ENTRY_POINT_GROUP, ())
    return tuple(sorted(selected, key=lambda entry: (entry.name, entry.value)))


def _context(descriptor: PluginDescriptor) -> PluginContext:
    root = config.agent_box_home()
    return PluginContext(
        agent_box_version=__version__,
        agent_box_home=root,
        plugin_data_dir=root / "plugins" / descriptor.id,
    )


def _distribution_info(entry_point) -> tuple[str | None, str | None]:
    """Return optional entry-point distribution metadata without making it required."""
    dist = getattr(entry_point, "dist", None)
    if dist is None:
        return None, None
    try:
        return getattr(dist, "name", None), getattr(dist, "version", None)
    except Exception:
        return None, None


def _validate_host_extensions(
    registration: PluginRegistration,
    seen_selectors: dict[str, str],
    seen_contributors: dict[str, str],
    seen_controls: dict[str, str],
    seen_harnesses: dict[str, str] | None = None,
) -> None:
    """Validate Host contributions before a plugin becomes READY.

    These IDs are consumed by the provider-neutral Host facade. Keeping the
    check in the canonical plugin loader prevents silent dict overwrites and
    ensures a failed plugin contributes no orphan Host extension.
    """
    seen_harnesses = seen_harnesses if seen_harnesses is not None else {}
    local: dict[str, set[str]] = {
        "selector": set(), "contributor": set(), "control": set(), "harness": set(),
    }
    for kind, items, global_seen, attr in (
        ("selector", registration.resource_selectors, seen_selectors, "id"),
        ("contributor", registration.finalization_contributors, seen_contributors, "id"),
        ("control", registration.host_controls, seen_controls, "provider_id"),
        ("harness", registration.harness_managers, seen_harnesses, "harness_id"),
    ):
        for item in items:
            component_id = getattr(item, attr, None)
            if not isinstance(component_id, str) or not component_id:
                raise ValueError(f"{kind} must declare a non-empty {attr}")
            if component_id in local[kind] or component_id in global_seen:
                raise ValueError(f"duplicate {kind} id: {component_id}")
            local[kind].add(component_id)
            global_seen[component_id] = kind
def load_installed_plugins(
    registry: ExtensionRegistry,
    *,
    strict: bool = False,
    entry_points: Iterable[metadata.EntryPoint] | None = None,
) -> PluginLoadReport:
    """Load installed plugins into ``registry``.

    Plugin packages are trusted executable Python code. A failing plugin is
    isolated and reported by default; ``strict=True`` makes startup fail fast.
    Each plugin must register all its Contracts before its providers.
    """
    records: list[PluginLoadRecord] = []
    seen_plugin_ids: set[str] = set()
    seen_selectors: dict[str, str] = {}
    seen_contributors: dict[str, str] = {}
    seen_controls: dict[str, str] = {}
    seen_harnesses: dict[str, str] = {}
    selected = tuple(entry_points) if entry_points is not None else _entry_points()

    for entry_point in sorted(selected, key=lambda entry: (entry.name, entry.value)):
        distribution_name, distribution_version = _distribution_info(entry_point)
        descriptor: PluginDescriptor | None = None
        registration: PluginRegistration | None = None
        try:
            factory = entry_point.load()
            plugin = factory()
            descriptor = plugin.descriptor()
            if not isinstance(descriptor, PluginDescriptor):
                raise TypeError("descriptor() must return PluginDescriptor")
            if descriptor.api_version != PLUGIN_API_VERSION:
                raise RuntimeError(
                    f"plugin API {descriptor.api_version} is incompatible with "
                    f"host API {PLUGIN_API_VERSION}"
                )
            if descriptor.id in seen_plugin_ids:
                raise RuntimeError(f"duplicate plugin id: {descriptor.id}")
            registration = plugin.build(_context(descriptor))
            if not isinstance(registration, PluginRegistration):
                raise TypeError("build() must return PluginRegistration")

            staged_selectors = dict(seen_selectors)
            staged_contributors = dict(seen_contributors)
            staged_controls = dict(seen_controls)
            staged_harnesses = dict(seen_harnesses)
            _validate_host_extensions(
                registration, staged_selectors, staged_contributors, staged_controls,
                staged_harnesses
            )

            registry.register_components(
                contracts=registration.contracts,
                resource_providers=registration.resource_providers,
                execution_providers=registration.execution_providers,
            )
            seen_selectors = staged_selectors
            seen_contributors = staged_contributors
            seen_controls = staged_controls
            seen_harnesses = staged_harnesses
            seen_plugin_ids.add(descriptor.id)
            records.append(
                PluginLoadRecord(
                    entry_point.name,
                    "READY",
                    descriptor,
                    registration,
                    None,
                    distribution_name,
                    distribution_version,
                )
            )
        except Exception as exc:
            status = "INCOMPATIBLE" if "incompatible" in str(exc) else "FAILED"
            record = PluginLoadRecord(
                entry_point.name,
                status,
                descriptor,
                registration,
                f"{type(exc).__name__}: {exc}",
                distribution_name,
                distribution_version,
            )
            records.append(record)
            if strict:
                raise RuntimeError(
                    f"failed to load Agent-Box plugin {entry_point.name}: {record.error}"
                ) from exc

    return PluginLoadReport(tuple(records))
