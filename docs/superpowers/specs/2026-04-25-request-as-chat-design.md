# Request-as-Chat — Design Spec

**Date:** 2026-04-25
**Scope:** PetMatchMobile (`PetMatchMobile/`) + coordinated backend changes
**Status:** Approved

## Context

Today the cycle from "list a pet" to "first chat message" takes 10+ taps and includes a hidden waiting state. A user who applies to adopt or breed must:

1. Submit the request form (it dumps them back to the previous screen)
2. Manually find the inbox (adoption: `AdoptionRequestsScreen`; breeding: a section inside `HomeScreen`)
3. Wait for the owner to approve — with no in-app signal that approval happened
4. Re-open the inbox, hunt for their pending request, tap "Start Chat"

The owner's side is no better — they only learn someone applied if they think to open the inbox themselves. The **inbox is pull-based, the user wants it push-based.** The two flows live in different inbox screens, doubling the surface area without reason.

For adoption specifically, KYC is required, but it's enforced **at the worst moment** — at submit time, before the user has any feedback that anyone wants their request. This drives drop-off. Worse, it's enforced **twice** (backend 403 at submit + frontend gate at chat-message time), so the codebase carries two sources of truth.

**The intended outcome.** Submitting a request lands the user inside the chat thread immediately. The owner approves with one tap from a push notification. KYC moves to its moment of peak motivation — right after approval — and lives as a bottom-sheet inside the chat so the user never context-switches. The inbox screens become secondary; the chat list becomes the primary surface.

This is the architectural fix, not a polish pass. After this, adoption + breeding share one chat-driven request lifecycle.

## Decisions locked

| Question | Answer |
|---|---|
| Direction | A3 — chat opens on submit, locked until approval |
| Scope | Both adoption AND breeding |
| Rejection UX | Soft archive, no required reason from owner |
| KYC placement | Post-approval, bottom-sheet inside chat, 7-day auto-archive on incomplete |
| KYC scope | Adoption only (breeding stays KYC-free) |
| Owner-side KYC | Out of scope (asymmetric stays asymmetric) |

## The new flow

```
Pet detail → Request form → Submit
                            │
                            ▼
                   Server: create request + chat room (one transaction)
                            │
                            ▼
                   Open ChatScreen (state = pending)
                            │  push to owner
                            ▼
                   Owner taps قبول (in-chat header OR push action)
                            │
            ┌───────────────┴────────────────┐
            ▼                                ▼
     adoption?                        breeding?
            │                                │
            ▼                                ▼
    requester is_verified?           chat unlocks for both
            │                        push to requester
        no  │  yes
            │   └─► chat unlocks both, push to requester
            ▼
    Banner: "ارفع هويتك لبدء المحادثة"
    [ ابدأ التوثيق ]  ← bottom sheet, not screen jump
            │
            ▼
    Submit docs → "⏳ قيد المراجعة"
            │  (admin reviews; push on result)
            ▼
    approved → chat unlocks both
    rejected → banner shows reason + retry button
            │
            └─► (if no completion in 7 days post-approval)
                Chat auto-archives with system message
```

## Three chat states (visual contract)

Banner colors map to whatever the design system uses for caution/success/neutral.

### State: `pending` (after submit, before owner responds)

- **Header banner**: ⏳ "هذا الطلب قيد المراجعة" (caution)
- **Pinned system card** at top: full request payload, expandable (housing, plans, notes for adoption; meeting date, target pet, notes for breeding).
- **Requester input area**: locked placeholder "🔒 لا يمكن إرسال رسائل قبل قبول الطلب".
- **Owner input area**: replaced with two sticky buttons — `✕ رفض` and `✓ قبول` (full-width pair).

### State: `approved` (owner tapped قبول OR approved from push action)

- **Banner**: ✅ "تم قبول الطلب" (success)
- **System message in stream**: "── تم قبول الطلب ──"
- **Pinned card**: stays, collapses after 5 user-authored messages OR 24h, whichever first.
- **Input**: unlocked for both — UNLESS adoption + requester not verified, see KYC sub-state below.

### State: `approved_pending_kyc` (adoption only, requester not verified)

- **Banner**: 🪪 "ارفع هويتك لبدء المحادثة" with primary CTA `ابدأ التوثيق`.
- **Owner-side mirror**: 🪪 "في انتظار توثيق المتقدم" (no action button).
- **Bottom sheet** opens on CTA tap. Reuses the form body of `VerificationScreen.tsx:1-557` (national ID photo + selfie video) — extracted as `<VerificationFormBody />` shared with the standalone screen.
- After requester submits docs:
  - State flips to `approved_kyc_pending_review`. Banner: ⏳ "قيد المراجعة". No action.
  - Owner mirror: ⏳ "قيد مراجعة المستندات".
- Admin verdict arrives via push:
  - **approved** → state flips to `approved` (input unlocked both sides).
  - **rejected** → banner shows admin's `admin_notes` + retry button. Sheet re-opens on tap.
- **7-day timeout**: if not `approved` within 7 days of owner approval, server auto-archives with system message "انتهت صلاحية الطلب — لم يتم إكمال التوثيق". Owner regains the listing slot.

### State: `rejected` (owner tapped رفض, OR auto-archived for KYC timeout)

- **Banner**: 🗂 "لم يتم قبول هذا الطلب" (neutral)
- **System message in stream**: "── لم يتم قبول الطلب ──"
- **Input**: removed entirely (not just disabled — gone).
- Chat moves to `Archived` section in `ChatListScreen` (existing `archiveChatRoom` API at `api.ts:1360`).
- Both sides can re-read history forever; neither can send.

## Data model + API changes

### Unified chat phase

Today `ChatStatus` (`api.ts:352-360`) only exposes `breeding_request_status` and `is_active`. We add a derived field on the chat-room payload:

```ts
type ChatPhase =
  | 'pending'                     // owner hasn't approved/rejected yet
  | 'approved'                    // open conversation
  | 'approved_pending_kyc'        // adoption-only: approved, requester not verified
  | 'approved_kyc_pending_review' // adoption-only: docs uploaded, waiting on admin
  | 'approved_kyc_rejected'       // adoption-only: re-upload required
  | 'rejected';                   // closed
```

Computed server-side from request status + user.is_verified + verification status + (for adoption) elapsed-days-since-approval.

### Backend changes (the ask)

1. **Drop the 403 `verification_required: true` at submission** for adoption (`api.ts:1481-1484` comment refers to current behavior). Allow request creation without `is_verified`. The chat-message-time gate (`ChatScreen.tsx:384-388`) becomes the single source of truth.
2. **Create chat room at request submission** (not at approval). Endpoints `apiService.createAdoptionChatRoom` (`api.ts:1343`) and `apiService.createChatRoom` (`api.ts:1326`) already POST to `/pets/chat/create/`. Backend just needs to allow that call when the underlying request is in `pending` state.
3. **Expose `chat_status: ChatPhase`** on the chat-room payload (computed server-side).
4. **7-day auto-archive job** for `approved_pending_kyc` and `approved_kyc_pending_review` chats that don't reach `approved`. Cron / Celery beat. Calls `archiveChatRoom` + emits push.
5. **Push payloads carry the right `actionId`s** (`BREEDING_APPROVE`, `ADOPTION_APPROVE`, etc. — declared `notifications.ts:15-21`). Verify already shipping; they were declared but never confirmed end-to-end.

### Frontend API methods

- `apiService.createAdoptionRequest` (`api.ts:1480`) — backend bundles chat-room creation; response now includes `{ request, chat_room }`. Frontend reads `chat_room` to navigate.
- `apiService.createBreedingRequest` (`api.ts:1005`) — same.
- `apiService.getChatPhase(chatRoomId)` — only if `chat_status` isn't inline on the chat-room payload (preferred path is inline).

## Files to modify

**Create:**
- `src/screens/chat/components/RequestSystemCard.tsx` — pinned card with request payload (adoption variant + breeding variant).
- `src/screens/chat/components/ChatStatusBanner.tsx` — top banner that swaps on `chat_status` changes.
- `src/screens/chat/components/OwnerActionBar.tsx` — `قبول` / `رفض` button pair shown in pending state.
- `src/screens/chat/components/VerificationFormSheet.tsx` — bottom sheet wrapping the extracted `<VerificationFormBody />`.
- `src/screens/profile/VerificationFormBody.tsx` — extracted form (ID photo + selfie video) shared by `VerificationScreen` and the sheet.

**Modify:**
- `src/screens/pets/PetDetailsScreen.tsx` — `requestAdoption()` (around line 191-193) and `requestBreeding()` no longer just open the form modal in isolation; on success they navigate directly to the new chat. Hook into the `onSuccess` of both request screens.
- `src/screens/adoption-request/AdoptionRequestScreen.tsx` — remove the `onRequireVerification` prop (KYC moves to chat). On submit success, parent navigates to ChatScreen using returned `chat_room`.
- `src/screens/breeding-request/BreedingRequestScreen.tsx` — same pattern.
- `src/screens/chat/ChatScreen.tsx` — biggest change:
  - Read `chat_status` from chat-room payload (or derive client-side as fallback during rollout).
  - Render `<ChatStatusBanner>`, `<RequestSystemCard>`, `<OwnerActionBar>` (pending + owner), `<VerificationFormSheet>` (adoption + approved_pending_kyc).
  - Replace `mustVerifyToChat` logic at `ChatScreen.tsx:384-414` with the unified `chat_status` flow.
  - Disable input based on phase.
- `src/screens/profile/VerificationScreen.tsx` — refactor to compose `<VerificationFormBody />`. No behavior change for the standalone path.
- `src/services/api.ts` — `ChatStatus` interface gains the unified phase; create-request methods return `chat_room`; helper `getChatPhase` if needed.
- `src/services/notifications.ts` — verify in-app handler routes the user into the correct chat (not the old inbox). Update navigation deeplink for `breeding_request_received` and `adoption_request_received` to open the chat directly.
- `src/screens/adoption-request/AdoptionRequestsScreen.tsx` — keep as "all requests history" view; remove the `handleStartChat` button (around line 106). Add a banner that the chat is now the primary surface.
- `src/screens/main/HomeScreen.tsx` — remove the inline `BreedingRequestsOverview` section (duplicates the chat list now).

**Reused (no changes):**
- `apiService.archiveChatRoom` (`api.ts:1360`) — soft rejection + KYC timeout.
- `apiService.respondToBreedingRequest` (`api.ts:1020`) and `respondToAdoptionRequest` (`api.ts:1517`).
- `apiService.submitVerification` (`api.ts:1588-1640`) — invoked from the bottom sheet.
- `apiService.getVerificationStatus` (`api.ts:1642`) — read on chat open during rollout to derive `chat_status` client-side as a fallback.
- System-message rendering already exists in `ChatScreen.tsx` (lines 360, 505, 1058-1087).

## Migration story

- **Pending requests with no chat room**: backend job creates chat rooms for them retroactively. Push the requester with "you can now chat about your pending request" once the chat room exists.
- **Approved requests with chat rooms but in old "Start Chat from inbox" model**: untouched — they continue to work since `ChatScreen` is backwards-compatible (the unified `chat_status` derives `approved` correctly for them).
- **Adoption requests blocked at submit-time today** (because user wasn't verified): on this release, they re-submit and succeed. No data migration needed.

## Verification plan

**Manual smoke (per flow):**

1. Adoption — fresh requester, not verified:
   - Submit form → land in chat (state = `pending`) → owner approves via push action → chat shows `approved_pending_kyc` banner → tap CTA → bottom sheet → submit ID + selfie → state flips to `approved_kyc_pending_review` → admin approves → state flips to `approved` → both can chat.
2. Adoption — verified requester:
   - Submit form → chat opens `pending` → owner approves → chat skips KYC, lands directly in `approved`.
3. Adoption — owner rejects:
   - Submit form → chat `pending` → owner taps رفض → state = `rejected` → both sides see archived chat, no input.
4. Adoption — KYC rejected by admin:
   - State = `approved_kyc_rejected`, banner shows admin's `admin_notes`, retry button re-opens sheet.
5. Adoption — KYC timeout:
   - Force the 7-day clock; chat auto-archives with system message; owner regains the listing slot.
6. Breeding — submit → chat `pending` → owner approves → chat `approved` (no KYC anywhere).
7. Breeding — owner rejects → chat `rejected`, archived.
8. Owner approve from push lock-screen action: never opens the app, just emits the action; chat phase advances; both sides see the change on next foreground.

**Code-level checks:**

- `npx tsc -p tsconfig.json --moduleResolution bundler --noEmit` from `PetMatchMobile/` — no new errors in changed files.
- `npx jest --config jest.config.js` — existing tests continue to pass, plus new tests for `ChatStatusBanner` state mapping and the 7-day timeout reducer.
- React DevTools profile on `ChatScreen` re-renders during state transitions — banner change must NOT remount the message list.

**Backend coordination + rollout sequence:**

The frontend can ship in two stages so it isn't blocked on the full backend ask landing all at once.

1. **Stage 1 — frontend-derived phase, flag off in production**
   - All new components built and wired into `ChatScreen`.
   - `chat_status` is **derived client-side** from existing fields: `breeding_request_status` / adoption equivalent + `user.is_verified` + `getVerificationStatus()` + `archiveChatRoom` history.
   - Old "approval gates chat" behavior preserved by feature flag default `false`.
   - Useful to QA the components in isolation.
2. **Stage 2 — backend lands the unified `chat_status` field, chat-at-submit, drop the 403, 7-day cron**
   - Frontend swaps from local derivation to the inline server field.
   - Local-derivation code stays as a fallback for ~one release, then is removed.
   - Feature flag flipped to `true`.

The flag is `requestChatV2Enabled`, added in the `appConfig.ts:8-19` family. Default `false` until Stage 2.

## Out of scope

- Owner-side KYC for adoption (asymmetric model preserved).
- Free-text rejection reasons (chosen "no reason" / soft archive).
- Per-listing owner toggle for "verified-only requesters".
- Real-time presence indicators in chat.
- Reworking the request *forms* (housing types, breeding pet selectors, etc.) — polish, separate task.
- Notification preferences UI changes.
- Removing `AdoptionRequestsScreen` entirely (keep as history; just demote).
- Adoption + breeding listing discovery, search, filters.
