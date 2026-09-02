from pathlib import Path
from agent_box.extensions import PluginContext, PluginDescriptor, PluginRegistration
from agent_box.work_core.registry import ProviderDescriptor
from .provider import GitWorkspaceResourceProvider
from .contributor import GitFinalizationContributor
from .inputs import GitWorkspaceSelector
from .repositories import RepositoryLibrary
from agent_box.protocols.host import resource_selector, finalization_contributor

class GitPlugin:
    def descriptor(self):
        return PluginDescriptor("git", "Agent-Box Git workspace", "0.1.0", description="Detached worktree materialization and output capture")
    def build(self, context: PluginContext):
        cfg = context.plugin_data_dir / "config.json"
        library = RepositoryLibrary(context.plugin_data_dir / "repositories.json")
        # No filesystem access during discovery/build: provider is lazy.
        repo_holder = {}
        class LazyGit(GitWorkspaceResourceProvider):
            def __init__(self): self._delegate = None
            def _p(self):
                if self._delegate is None:
                    import json
                    values = json.loads(cfg.read_text()) if cfg.exists() else {}
                    repos = library.list(values)
                    repo = repos[0].get("path") if repos else values.get("repo")
                    if not repo: raise ValueError(f"configure Git repository in {cfg}")
                    managed = repos[0].get("managed_root") if repos else values.get("managed_root", str(context.plugin_data_dir / "worktrees"))
                    self._delegate = GitWorkspaceResourceProvider(Path(repo), Path(managed or context.plugin_data_dir / "worktrees"))
                return self._delegate
            def list_repositories(self):
                values = json.loads(cfg.read_text()) if cfg.exists() else {}
                return library.list(values)
            def add_repository(self, value): return library.add(value)
            def descriptor(self): return ProviderDescriptor("git-workspace", "Git detached workspace", "1")
            def make_ref(self, selector): return self._p().make_ref(selector)
            def make_ref_for(self, repository_id, selector):
                values = json.loads(cfg.read_text()) if cfg.exists() else {}
                item = next((x for x in library.list(values) if x.get("id") == repository_id), None)
                if item is None: raise ValueError("REPOSITORY_NOT_FOUND")
                return GitWorkspaceResourceProvider(Path(item["path"]), Path(item.get("managed_root") or context.plugin_data_dir / "worktrees")).make_ref(selector)
            def resolve(self, contract_id, ref, **kwargs): return self._p().resolve(contract_id, ref, **kwargs)
            def capture(self, **kwargs): return self._p().capture(**kwargs)
            def cleanup(self, execution_id): return self._p().cleanup(execution_id)
        provider = LazyGit()
        return PluginRegistration(
            resource_providers=(provider,),
            contributions=(resource_selector(GitWorkspaceSelector(provider)), finalization_contributor(GitFinalizationContributor(provider))),
        )

def create_plugin(): return GitPlugin()
