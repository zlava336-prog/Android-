# Phone Agent - Android Companion Application

Production-oriented personal Android companion agent controlled by your own backend / Master AI.
Strictly safe, authorized social media publisher and link extractor with zero-trust security boundaries.

## Architecture Highlights

1. **Safety Enforcements (Zero-Trust Guardrails)**:
   - **Prohibited Apps**: Banking apps, UPI apps (PhonePe, Google Pay, Paytm), SMS/MMS apps, and Password Managers are hard-coded prohibited. If accessed, the agent immediately halts via `EmergencyStopManager`.
   - **Sensitive UI Tripwires**: Automated scanning checks all node texts for `OTP`, `PIN`, `Password`, `CVV`, `Credit Card`, and `CAPTCHA`. Any detection immediately aborts the job.
   - **No Hidden Automation**: All automation runs with active screen feedback and local audit logging.
   - **Mandatory User Approval**: Publishing cannot proceed without explicit operator confirmation.
   - **Emergency STOP**: Persistent floating action button and Android Notification action.

2. **Core Modules**:
   - `com.phoneagent.core.model.JobModel`: Strict data class matching JSON protocol.
   - `com.phoneagent.core.state.JobStateMachine`: 13-stage deterministic finite state machine.
   - `com.phoneagent.core.accessibility.UiInspector`: Safe accessibility inspection.
   - `com.phoneagent.core.accessibility.ActionExecutor`: Safe gesture and click dispatcher.
   - `com.phoneagent.core.adapter.AppAdapter`: Standard interface for all target applications.
   - `com.phoneagent.adapter.InstagramAdapter`: Safe Instagram Reels publisher.
   - `com.phoneagent.adapter.AmazonAdapter`: Safe product search and link extraction (NO BUYING allowed).
   - `com.phoneagent.service.PhoneAgentAccessibilityService`: Restricted Android Accessibility Service.
   - `com.phoneagent.service.AgentForegroundService`: Foreground service with emergency stop notification.

## Building in Android Studio

1. Open Android Studio (Ladybug or newer).
2. Open the `/android` directory.
3. Sync project with Gradle files.
4. Run `./gradlew test` to execute the Unit Tests.
5. Deploy to Android device with Developer Mode & USB Debugging.
6. Enable **Phone Agent** under `Settings > Accessibility > Installed Services`.
