# Pritha launchd templates

The current Control Center template is
`com.numericalart.pritha.control-center.instance.plist.template`. Use
`scripts/control-center-runtime.mjs plan` and
`07_workflows/control-center-staged-release.md` for rendering, ownership checks,
installation and recovery. Lifecycle mutations require immediate explicit
approval and `--yes`. Bootstrap does not install or enable a service.

The existing `com.techscope.*` files are compatibility templates for older web,
Telegram and self-test services. Their labels and placeholders are retained for
recovery of already installed configurations. They are not the current Control
Center deployment path. Legacy executable names delegate to the Pritha scripts.
Do not rename an installed service or enable one merely to change its label.

Filled plists, real paths, credentials and private endpoints belong in local
state. Never commit a rendered plist. Optional Telegram polling and scheduled
self-tests require their own explicit deployment decision.
