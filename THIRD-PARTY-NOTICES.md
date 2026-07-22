# Third-party notices — JobTracker (jobtracker.polecat.live)

JobTracker is open source under the **GPL-3.0** license and is built as a
static, no-build-step web app. It bundles **no third-party runtime
libraries**: the UI is first-party code plus a vendored copy of the
**Polecat Shell** (`vendor/polecat-shell/`), part of the Polecat suite
(`kevinrhaas/polecat-platform`, GPL-3.0) — not a third party.

## Optional external services

JobTracker can mirror your data to **Turso (libSQL HTTP)** if you connect it,
using credentials you provide; it bundles none of their code and stores your
configuration in your browser's local storage only.
