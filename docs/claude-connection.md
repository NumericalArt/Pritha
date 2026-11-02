---
id: pritha-claude-connection
type: workflow
status: active
created: 2026-11-02
updated: 2026-11-02
topics: [pritha, onboarding, claude, authentication]
tools: [Pritha, Claude Code, macOS Keychain]
sources:
  - https://code.claude.com/docs/en/setup
  - https://code.claude.com/docs/en/authentication
related:
  workflows: [START_HERE.md, 07_workflows/first-run-setup.md, 07_workflows/2026-11-01-pritha-provider-convergence-roadmap.md]
supersedes: []
superseded_by: []
source_version: Claude Code 2.1.296; Pritha provider convergence
retrieved: 2026-11-02
verified: 2026-11-02
subject: {kind: pritha, id: pritha}
privacy: public
retention: durable
review_status: reviewed-source
confidence: medium
---

# Connect Claude

Prepare Pritha using [Start here](../START_HERE.md). Both Claude connection modes
use an installed Claude Code CLI. If it is missing, follow the
[official installation guide](https://code.claude.com/docs/en/setup) and check
`claude --version`. Pritha checks the installed CLI and required sandbox features
before allowing a task. The reviewed external runtime currently supports macOS.

Open **Settings → Providers → Claude Code** and choose one connection mode:

| Mode | What you provide | Where it is used |
| --- | --- | --- |
| API key | An Anthropic API key entered in Settings | Task Chat and builds with a reserved token budget |
| Local CLI session | Browser sign-in to your eligible Claude account | Personal Task Chat through the official CLI |

These connections are independent. Choosing a native session does not configure
API billing, and a build that needs an API key cannot silently switch to it.
Account eligibility is defined by
[Claude Code authentication](https://code.claude.com/docs/en/authentication).

## Sign in with a Claude account

1. Select **Local CLI session**, choose a model and save the preset.
2. Press **Copy sign-in command** and paste the complete command into Terminal.
   It already selects this Pritha installation and its private state; you do
   not need to edit paths or environment variables.
3. Complete the browser sign-in. If Claude asks for a browser code, paste it
   into that terminal prompt. Wait for the command to finish with
   `"authenticated":true`.
4. Refresh the provider status in Settings, choose **Use for new chats**, and
   send a short task in a new Task Chat. The first successful task also confirms
   that this account can use the selected model.

The command can run from any directory. A successful sign-in is retained for
this installation; ordinary later tasks do not require repeating it. An expired
or revoked session can require another sign-in. Existing chats retain their
original provider and model.

Pritha gives the unmodified Claude CLI a private configuration directory and
lets it manage its own login. The host does not extract OAuth tokens. On macOS,
the trusted CLI uses the user's Keychain; model tools run separately and do not
receive that filesystem access. Other Pritha installations and an ordinary
standalone Claude session are not automatically imported.

## Connect an API key

Select **API key**, enter the key in the provider password field and save it.
Choose a model from the available catalog, save the preset and refresh status.
Then select **Use for new chats** and send a short task. This mode uses API
billing. Never put a key into a chat message or a tracked repository file.

## If sign-in does not finish

| Message or symptom | Next action |
| --- | --- |
| Claude CLI is unavailable or its version is unverified | Check the CLI installation and version using the official guide; retry the readiness check. |
| macOS confirms that the login Keychain is locked | Unlock it using macOS Keychain Access, then retry the copied sign-in command once. Enter the password only in the local macOS prompt. |
| Saving the login or API key fails although Keychain is unlocked; access is denied | Stop repeated key entry or sign-in attempts. An unlocked Keychain does not prove that a particular credential can be read or saved. Preserve the diagnostic code and refresh readiness after the macOS access problem is resolved. |
| Saving times out or cannot be confirmed | Refresh provider status before trying again. The write may have finished even when its response was lost; an error alone does not prove that the key was not saved. |
| The key is saved, but the connection is not ready | Refresh provider status and address its reported authentication, model or runtime issue. Do not resave the key just because readiness failed. |
| Browser sign-in finished, but `authenticated` is false | Use this instance's complete copied command and finish its terminal prompt. A browser page alone does not confirm that credentials were saved. |
| Sign-in is ready, but the first task reports model access or billing failure | Check that the selected account and model are available in the chosen connection mode. |
| Native session cannot be verified after an interrupted command | Preserve the private state and report the diagnostic code. Do not delete locks or credentials to force another run. |

Keys, browser login URLs, authorization codes and Keychain contents should never
be sent to Pritha chat or included in a bug report. The diagnostic status and
CLI version are enough to begin troubleshooting.

The release roadmap records automated checks separately from real account,
fresh-installation and first-task acceptance. Installation instructions alone
do not constitute a completed live acceptance test.
