"""Small runtime compatibility shims for Pritha Python scripts."""


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
