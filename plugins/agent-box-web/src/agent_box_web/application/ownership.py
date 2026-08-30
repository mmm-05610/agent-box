from __future__ import annotations
import atexit, fcntl, os
from pathlib import Path
class MutationOwner:
    def __init__(self, home: Path): self.path=home/"host"/"mutation.lock"; self.handle=None
    def acquire(self):
        self.path.parent.mkdir(parents=True,exist_ok=True); self.handle=self.path.open("a+")
        try: fcntl.flock(self.handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as exc: self.handle.close(); self.handle=None; raise RuntimeError("MUTATION_OWNER_UNAVAILABLE: another mutating Host is running") from exc
        self.handle.seek(0); self.handle.truncate(); self.handle.write(str(os.getpid())); self.handle.flush(); atexit.register(self.release)
    def release(self):
        if self.handle:
            fcntl.flock(self.handle.fileno(),fcntl.LOCK_UN); self.handle.close(); self.handle=None
