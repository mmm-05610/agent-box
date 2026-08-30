from pathlib import Path
from agent_box import config
from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.work_core.registry import ProviderDescriptor
from .provider import GitWorkspaceResourceProvider
from .contributor import GitFinalizationContributor
from .inputs import GitWorkspaceSelector

class GitPlugin:
    def descriptor(self):
        return PluginDescriptor("git", "Agent-Box Git workspace", "0.1.0", description="Detached worktree materialization and output capture")
    def build(self, context: PluginContext):
        cfg = context.plugin_data_dir / "config.json"
        # No filesystem access during discovery/build: provider is lazy.
        repo_holder = {}
        class LazyGit(GitWorkspaceResourceProvider):
            def __init__(self): self._delegate = None
            def _p(self):
                if self._delegate is None:
                    import json
                    values = json.loads(cfg.read_text()) if cfg.exists() else {}
                    repo = values.get("repo")
                    if not repo: raise ValueError(f"configure Git repository in {cfg}")
                    self._delegate = GitWorkspaceResourceProvider(Path(repo), Path(values.get("managed_root", str(context.plugin_data_dir / "worktrees"))))
                return self._delegate
            def descriptor(self): return ProviderDescriptor("git-workspace", "Git detached workspace", "1")
            def make_ref(self, selector): return self._p().make_ref(selector)
            def resolve(self, contract_id, ref, **kwargs): return self._p().resolve(contract_id, ref, **kwargs)
            def capture(self, **kwargs): return self._p().capture(**kwargs)
            def cleanup(self, execution_id): return self._p().cleanup(execution_id)
        provider = LazyGit()
        return PluginRegistration(
            resource_providers=(provider,),
            resource_selectors=(GitWorkspaceSelector(provider),),
            finalization_contributors=(GitFinalizationContributor(provider),),
        )

def create_plugin(): return GitPlugin()
