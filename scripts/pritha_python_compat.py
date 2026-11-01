"""Small runtime and environment compatibility shims for Pritha Python scripts."""

import os
from pathlib import Path
from pritha_paths import resolve_pritha_root, pritha_root_environment


def _load_path_env_file(file_path):
    """Load only Pritha path settings without exposing unrelated secrets."""
    try:
        lines = Path(file_path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return False

    allowed = {"PRITHA_ROOT", "TECHSCOPE_ROOT", "PRITHA_STATE_ROOT"}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key not in allowed or key in os.environ:
            continue
        os.environ[key] = value.strip().strip("\"'")
    return True


def load_pritha_runtime_env(root=None):
    """Resolve the instance-local state pointer for direct Python entrypoints."""
    code_root = resolve_pritha_root(root=root)
    if root is not None:
        os.environ.update(pritha_root_environment(code_root))
    _load_path_env_file(code_root / ".env")
    _load_path_env_file(code_root / ".env.local")

    configured_root = resolve_pritha_root(cwd=code_root)
    state_root = Path(os.path.abspath(os.environ.get("PRITHA_STATE_ROOT") or configured_root))
    if state_root.resolve() == configured_root.resolve():
        state_root = configured_root
    if state_root != configured_root:
        _load_path_env_file(state_root / "config" / "runtime.env")
    configured_root = resolve_pritha_root(cwd=configured_root)
    os.environ.update(pritha_root_environment(configured_root))
    return configured_root, state_root


def apply_runtime_compat():
    """Patch optional dependency incompatibilities before heavy ML imports."""
    try:
        import urllib3.util.ssl_ as urllib3_ssl
    except Exception:
        return

    if not hasattr(urllib3_ssl, "DEFAULT_CIPHERS"):
        urllib3_ssl.DEFAULT_CIPHERS = (
            "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:"
            "ECDH+AESGCM:DH+AESGCM:ECDH+AES:DH+AES:RSA+AESGCM:"
            "RSA+AES:!aNULL:!eNULL:!MD5:!DSS"
        )
