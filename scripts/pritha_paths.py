"""Pritha root identity; parity contract with lib/root-resolution.mjs."""
import os
import subprocess
from pathlib import Path


class PrithaRootError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _directory(value, cwd):
    try:
        if not isinstance(value, (str, os.PathLike)) or not str(value) or "\0" in str(value):
            raise ValueError()
        candidate = Path(value)
        resolved = Path(os.path.abspath(candidate if candidate.is_absolute() else cwd / candidate))
        if not resolved.resolve(strict=True).is_dir():
            raise ValueError()
        return resolved
    except (OSError, ValueError, RuntimeError):
        raise PrithaRootError("pritha_root_invalid", "The selected Pritha root is not an accessible directory. Correct PRITHA_ROOT (or its legacy TECHSCOPE_ROOT alias); no other instance was selected.") from None


def resolve_pritha_root(root=None, cwd=None, env=None):
    environment = os.environ if env is None else env
    working = Path(cwd or Path.cwd()).absolute()
    if root is not None:
        return _directory(root, working)
    current = _directory(environment["PRITHA_ROOT"], working) if environment.get("PRITHA_ROOT") else None
    legacy = _directory(environment["TECHSCOPE_ROOT"], working) if environment.get("TECHSCOPE_ROOT") else None
    if current and legacy and current.resolve() != legacy.resolve():
        raise PrithaRootError("pritha_root_conflict", "PRITHA_ROOT and TECHSCOPE_ROOT select different directories. Set both to the same project, unset the legacy alias, or choose an explicit --root.")
    if current or legacy:
        return current or legacy
    base = _directory(working, Path.cwd())
    git_env = {key: value for key, value in {**os.environ, **environment}.items() if not key.startswith("GIT_") and value is not None}
    try:
        result = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=base, env=git_env, capture_output=True, text=True, check=True, timeout=2).stdout.strip()
        if result:
            return _directory(result, base)
    except (OSError, subprocess.SubprocessError, PrithaRootError):
        pass
    return base


def pritha_root_environment(root):
    canonical = str(resolve_pritha_root(root=root))
    return {"PRITHA_ROOT": canonical, "TECHSCOPE_ROOT": canonical}
