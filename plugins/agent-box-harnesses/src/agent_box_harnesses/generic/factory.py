from __future__ import annotations

from agent_box.extensions import PluginDescriptor, PluginRegistration
from agent_box.extensions.contribution import CatalogContribution, ContributionDescriptor
from agent_box.protocols.host import resource_selector, resource_library, host_control
from ..controls import ProviderHostControl
from ..native_home.contribution import SkillInstallerContribution
from ..native_home.kinds import SKILL_INSTALLER_KIND
from ..native_home.policy import FIVE_POLICIES
from ..registry import load_builtin_registry
from ..adapters import ADAPTERS
from .profile_store import ProfileStore
from .profile_selector import GenericProfileSelector
from .profile_manager import GenericProfileManager
from .execution_provider import GenericExecutionProvider

GUEST_HOME_PREFIX = "/runtime/home/"


def _config_renderers() -> dict[str, object]:
    """Adapter-owned payload renderers for native-home seeding/patching.

    The renderer emits (guest-home-relative path, bytes) for the managed
    config candidates; the store only ever writes paths classified as
    CONFIG_AUTHORITY by the NativeHomePolicy.
    """
    renderers: dict[str, object] = {}
    for definition in load_builtin_registry().all():
        adapter = ADAPTERS[definition.driver]

        def render(payload, _adapter=adapter):
            return tuple(
                (candidate.guest_path.removeprefix(GUEST_HOME_PREFIX), candidate.content)
                for candidate in _adapter.render_native_config(payload)
            )

        renderers[definition.harness_type] = render
    return renderers


def build_registration(context, harness_type: str | None = None):
    registry = load_builtin_registry()
    definition = registry.get(harness_type) if harness_type else None
    # The shared provider is deliberately the only component which owns profile persistence.
    store = ProfileStore(
        context.agent_box_home / "profiles",
        validator=(lambda h, p: ADAPTERS[registry.get(h).driver].validate_native_payload(p)),
        policies=FIVE_POLICIES,
        config_renderers=_config_renderers(),
    )
    if definition is None:
        return PluginRegistration(resource_providers=(store,))
    adapter = ADAPTERS.get(definition.driver)
    if adapter is None:
        raise ValueError("untrusted adapter key")
    provider = GenericExecutionProvider(
        definition, adapter,
        staging_root=context.plugin_data_dir / "execution-staging",
        profile_store=store,
    )
    manager = GenericProfileManager(store, definition)
    installer = SkillInstallerContribution(store, definition.harness_type)
    return PluginRegistration(
        execution_providers=(provider,),
        contributions=(
            resource_selector(GenericProfileSelector(store, definition)),
            host_control(ProviderHostControl(provider.provider_id, provider)),
            resource_library(manager),
            CatalogContribution(ContributionDescriptor(SKILL_INSTALLER_KIND, installer.id), installer),
        ),
    )

def descriptor(harness_type=None):
    d=load_builtin_registry().get(harness_type) if harness_type else None
    return PluginDescriptor("harness-profile-store" if d is None else harness_type,d.display_name if d else "Harness Profile Store","2.0.0a1",description="Declarative official Harness registry",config_namespace="harnesses")
