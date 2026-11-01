"""Read-only persisted filename selection, matching lib/state-files.mjs."""
import os
import stat
from pathlib import Path
from pritha_paths import resolve_pritha_root


class PrithaStateFileError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _invalid():
    raise PrithaStateFileError("pritha_state_path_invalid", "Pritha state must use regular files inside its selected state directory. Repair the path before continuing.")


def _inspect(boundary, file):
    try:
        relative = file.relative_to(boundary)
        physical = boundary.resolve(strict=True)
        if not physical.is_dir():
            _invalid()
        current = boundary
        for index, part in enumerate(relative.parts):
            current /= part
            info = current.lstat()
            if stat.S_ISLNK(info.st_mode) or not current.resolve(strict=True).is_relative_to(physical):
                _invalid()
            if index < len(relative.parts) - 1:
                if not stat.S_ISDIR(info.st_mode):
                    _invalid()
            else:
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    _invalid()
                return True
    except FileNotFoundError:
        return False
    except PrithaStateFileError:
        raise
    except (OSError, ValueError, RuntimeError):
        _invalid()
    _invalid()


def inspect_pritha_state_files(kind, root=None, state_root=None, env=None):
    if kind not in ("memory", "setup"):
        raise PrithaStateFileError("pritha_state_kind_invalid", "Choose memory or setup state.")
    environment = os.environ if env is None else env
    code = resolve_pritha_root(root=root, env=environment)
    state = Path(os.path.abspath(state_root or environment.get("PRITHA_STATE_ROOT") or code))
    if state.resolve() == code.resolve():
        state = code
    local = state == code
    directory = state / (".memory" if local else "memory") if kind == "memory" else state if local else state / "setup"
    current = directory / ("pritha.sqlite" if kind == "memory" else ".pritha-setup.json" if local else "setup.json")
    legacy = directory / ("techscope.sqlite" if kind == "memory" else ".techscope-setup.json") if kind == "memory" or local else None
    canonical_exists = _inspect(state, current)
    legacy_exists = _inspect(state, legacy) if legacy else False
    barrier = state / (".private" if local else "private") / "state-migration" / "active.json"
    return {"kind": kind, "root": code, "state_root": state, "current": current, "legacy": legacy,
            "canonical_exists": canonical_exists, "legacy_exists": legacy_exists, "barrier": barrier,
            "migration_pending": _inspect(state, barrier)}


def resolve_pritha_state_file(kind, root=None, state_root=None, env=None):
    value = inspect_pritha_state_files(kind, root, state_root, env)
    if value["migration_pending"]:
        raise PrithaStateFileError("pritha_state_migration_pending", "A Pritha state migration needs recovery. Complete or roll back that migration before opening state.")
    if value["canonical_exists"] and value["legacy_exists"]:
        raise PrithaStateFileError("pritha_state_conflict", f"Both Pritha and legacy {kind} files exist. Choose the source in a state migration plan; neither file was changed.")
    return value["legacy"] if value["legacy_exists"] else value["current"]


def resolve_pritha_memory_database(root=None, state_root=None, env=None):
    return resolve_pritha_state_file("memory", root=root, state_root=state_root, env=env)


def resolve_pritha_setup_file(root=None, state_root=None, env=None):
    return resolve_pritha_state_file("setup", root=root, state_root=state_root, env=env)
