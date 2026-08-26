# Request-as-Chat — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land all client-side machinery for the new request-as-chat flow behind a feature flag (`requestChatV2Enabled`, default `false`). Components, ChatScreen restructure, request→chat navigation, push deeplinks. End state: flipping the flag in dev shows the new flow end-to-end against locally-derived state. Stage 2 (backend lands chat-at-submit + unified `chat_status` field + 7-day cron) is a separate plan.

**Architecture:** All new visual pieces live as components under `src/screens/chat/components/`. A pure derivation function `deriveChatPhase(input)` lives in `src/utils/chatPhase.ts` — single source of truth for which UI state to render. ChatScreen reads the phase, renders one of: locked input + system card (pending), unlocked input (approved), KYC sheet trigger banner (approved_pending_kyc), retry banner (kyc_rejected), or no input at all (rejected/archived). The flag gates the new code paths; the old "approval gates chat" path stays intact when flag is off.

**Tech Stack:** React Native bare 0.74.5, TypeScript, Jest (preset: react-native), AsyncStorage, FCM via `@react-native-firebase/messaging`, notifee for local. No new runtime dependencies needed for Stage 1.

---

## Pre-flight (read before starting)

**Working tree state.** The repo's `staging` branch currently carries substantial uncommitted WIP across `PetMatchMobile/`. Before starting Task 1, confirm with the user whether to:
- (a) Commit/stash the WIP and work on top of it, OR
- (b) Cut a `feature/request-as-chat-stage1` branch from `staging` and work there.

Don't add new files on top of unsynced WIP — file conflicts will be miserable.

**Tests.** No `@testing-library/react-native` is installed. Existing test files (`appConfig.test.ts`, `appUpdate.test.ts`) test pure logic only. We follow the same pattern: pure-logic tests for `chatPhase.ts`, the feature-flag plumbing, and any reducer-style state. Components are validated via type-check + `npx jest` smoke pass + manual smoke. **Do not introduce a UI testing library in this plan** — that's a separate decision.

**Run from `PetMatchMobile/` directory** for all commands unless prefixed with the repo root.

**Commit style.** Recent commits use `feat(scope): ...` and `fix(scope): ...`. Use `feat(chat-v2): ...` for new code, `refactor(chat-v2): ...` when restructuring. Always include the `Co-Authored-By` line as in `git log`.

**No backend changes.** Backend may return `success: false` if you try to create a chat at request submit before Stage 2 ships. The frontend code added in this plan must NOT depend on that working. Use the *flag-off* code path (existing inbox flow) in production until Stage 2.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `src/utils/chatPhase.ts` | Pure function `deriveChatPhase(input)` mapping API state to `ChatPhase`. No React. |
| `src/utils/chatPhase.test.ts` | Unit tests for `deriveChatPhase`. |
| `src/screens/chat/components/ChatStatusBanner.tsx` | Banner above message list. Switches color/icon/CTA on phase. |
| `src/screens/chat/components/RequestSystemCard.tsx` | Pinned card showing the request payload (adoption + breeding variants). Collapsible. |
| `src/screens/chat/components/OwnerActionBar.tsx` | Sticky قبول / رفض pair shown to the owner in `pending` phase. |
| `src/screens/profile/VerificationFormBody.tsx` | Extracted form parts (national ID + selfie video) shared by `VerificationScreen` and the new sheet. |
| `src/screens/chat/components/VerificationFormSheet.tsx` | Bottom sheet wrapping `VerificationFormBody`. |

**Modify**

| File | Reason |
|---|---|
| `src/services/appConfig.ts` | Add `requestChatV2Enabled` to AppConfig type, defaults, parser. |
| `src/services/featureFlags.ts` | Expose the new flag. |
| `src/services/config.ts` | Add `requestChatV2Enabled` key to `LOCAL_FEATURE_OVERRIDES`. |
| `src/services/api.ts` | Add `ChatPhase` type; widen create-request response shape; no behavior change. |
| `src/screens/chat/ChatScreen.tsx` | Read phase from chat-room payload (or local derivation in Stage 1), mount new components, gate input, route approve/reject. Flag-gated. |
| `src/screens/profile/VerificationScreen.tsx` | Refactor to compose `VerificationFormBody`. No behavior change for the standalone screen. |
| `src/screens/adoption-request/AdoptionRequestScreen.tsx` | Plumb chat-room id through `onSuccess`. |
| `src/screens/breeding-request/BreedingRequestScreen.tsx` | Same. |
| `src/screens/pets/PetDetailsScreen.tsx` | Add `onOpenChat?: (firebaseChatId: string) => void` prop, thread it to `onSuccess` callbacks. |
| `src/screens/main/HomeScreen.tsx` | Pass `onOpenChat` into `PetDetailsScreen`. Reuse the existing `setShowChatList` + `setInitialChatFirebaseId` machinery. |
| `src/screens/adoption-request/AdoptionRequestsScreen.tsx` | Flag-gated demote: replace `handleStartChat` with a "go to chat list" pointer + a banner. |
| `src/services/notifications.ts` | Flag-gated deeplink: route `*_received` notifications to the chat directly instead of the inbox. |

---

## Task 1 — Add `requestChatV2Enabled` feature flag

**Files:**
- Modify: `src/services/appConfig.ts`
- Modify: `src/services/config.ts`
- Modify: `src/services/featureFlags.ts`

- [ ] **Step 1: Read current state**

```bash
sed -n '8,20p' src/services/appConfig.ts
```

Expected: `AppConfig` type with `clinicHomeEnabled`, `clinicMapEnabled`, `serverMapClusteringEnabled`, version fields.

- [ ] **Step 2: Extend `AppConfig` type and defaults**

Edit `src/services/appConfig.ts` — find the `AppConfig` type around line 8:

```ts
export type AppConfig = {
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
  requestChatV2Enabled: boolean;  // NEW
  androidMinSupportedVersion: string;
  // ... rest unchanged
};
```

Find `getDefaultAppConfig()` around line 47 — add the line:

```ts
  requestChatV2Enabled: false,
```

Find `parseAppConfig()` around line 60 — add the parser:

```ts
    requestChatV2Enabled: normalizeBool(
      payload?.request_chat_v2_enabled,
      defaults.requestChatV2Enabled,
    ),
```

Find `applyDevOverrides()` (added in the dev-override task) — add the override branch:

```ts
  if (typeof overrides.requestChatV2Enabled === 'boolean') {
    next.requestChatV2Enabled = overrides.requestChatV2Enabled;
  }
```

- [ ] **Step 3: Extend `LOCAL_FEATURE_OVERRIDES` in `config.ts`**

Edit `src/services/config.ts` — extend the `Partial<{...}>` type and the default object:

```ts
export const LOCAL_FEATURE_OVERRIDES: Partial<{
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
  requestChatV2Enabled: boolean;  // NEW
}> = {
  clinicHomeEnabled: true,
  clinicMapEnabled: true,
  // requestChatV2Enabled: true,  // uncomment in dev to see the new flow
};
```

- [ ] **Step 4: Expose the flag in `featureFlags.ts`**

Edit `src/services/featureFlags.ts` — extend `FeatureFlags` and the mapper:

```ts
export type FeatureFlags = {
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
  requestChatV2Enabled: boolean;  // NEW
};

const mapAppConfigToFeatureFlags = (config: AppConfig): FeatureFlags => ({
  clinicHomeEnabled: config.clinicHomeEnabled,
  clinicMapEnabled: config.clinicMapEnabled,
  serverMapClusteringEnabled: config.serverMapClusteringEnabled,
  requestChatV2Enabled: config.requestChatV2Enabled,  // NEW
});
```

- [ ] **Step 5: Run existing tests, verify they still pass**

```bash
npx jest --config jest.config.js src/services/appConfig.test.ts -v
```

Expected: 2 tests pass (default-when-no-cache, cached-when-fail).

- [ ] **Step 6: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep -E "appConfig|featureFlags|config\.ts" | head -20
```

Expected: empty output (no new errors in changed files).

- [ ] **Step 7: Commit**

```bash
git add src/services/appConfig.ts src/services/config.ts src/services/featureFlags.ts
git commit -m "$(cat <<'EOF'
feat(chat-v2): add requestChatV2Enabled feature flag

Wires the flag through AppConfig parser, defaults (false), feature flag
hook, and LOCAL_FEATURE_OVERRIDES. No call sites yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Add `ChatPhase` type to api.ts

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Read existing ChatStatus**

```bash
sed -n '352,360p' src/services/api.ts
```

Expected: `ChatStatus` interface with `is_active`, `breeding_request_status`, etc.

- [ ] **Step 2: Add ChatPhase + extend ChatStatus**

Edit `src/services/api.ts` — directly above the existing `export interface ChatStatus` block (around line 352):

```ts
export type ChatPhase =
  | 'pending'
  | 'approved'
  | 'approved_pending_kyc'
  | 'approved_kyc_pending_review'
  | 'approved_kyc_rejected'
  | 'rejected';
```

Then extend `ChatStatus`:

```ts
export interface ChatStatus {
  id: number;
  firebase_chat_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  breeding_request_status: string;
  participants_count: number;
  // Stage 2: backend will populate this. Stage 1: undefined → derive client-side.
  chat_status?: ChatPhase;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep "api.ts" | head -10
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts
git commit -m "$(cat <<'EOF'
feat(chat-v2): add ChatPhase type and chat_status field on ChatStatus

Stage 2 backend will populate chat_status. Stage 1 keeps it optional and
derives client-side from existing fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Pure derivation utility `chatPhase.ts` with tests

**Files:**
- Create: `src/utils/chatPhase.ts`
- Create: `src/utils/chatPhase.test.ts`

- [ ] **Step 1: Write the failing test file first**

Create `src/utils/chatPhase.test.ts`:

```ts
import { deriveChatPhase, type DeriveChatPhaseInput } from './chatPhase';

const baseInput: DeriveChatPhaseInput = {
  requestKind: 'adoption',
  requestStatus: 'pending',
  isActive: true,
  isRequester: true,
  isRequesterVerified: false,
  verificationStatus: undefined,
};

describe('deriveChatPhase', () => {
  it('returns "pending" when request is pending', () => {
    expect(deriveChatPhase({ ...baseInput, requestStatus: 'pending' })).toBe('pending');
  });

  it('returns "rejected" when request rejected', () => {
    expect(deriveChatPhase({ ...baseInput, requestStatus: 'rejected' })).toBe('rejected');
  });

  it('returns "rejected" when chat is_active is false', () => {
    expect(
      deriveChatPhase({ ...baseInput, requestStatus: 'approved', isActive: false }),
    ).toBe('rejected');
  });

  it('breeding approved → "approved" without any KYC steps', () => {
    expect(
      deriveChatPhase({
        ...baseInput,
        requestKind: 'breeding',
        requestStatus: 'approved',
        isRequesterVerified: false,
      }),
    ).toBe('approved');
  });

  it('adoption approved + verified → "approved"', () => {
    expect(
      deriveChatPhase({
        ...baseInput,
        requestStatus: 'approved',
        isRequesterVerified: true,
      }),
    ).toBe('approved');
  });

  it('adoption approved + not verified + no docs → "approved_pending_kyc"', () => {
    expect(
      deriveChatPhase({
        ...baseInput,
        requestStatus: 'approved',
        isRequesterVerified: false,
        verificationStatus: undefined,
      }),
    ).toBe('approved_pending_kyc');
  });

  it('adoption approved + verification pending review → "approved_kyc_pending_review"', () => {
    expect(
      deriveChatPhase({
        ...baseInput,
        requestStatus: 'approved',
        isRequesterVerified: false,
        verificationStatus: 'pending',
      }),
    ).toBe('approved_kyc_pending_review');
  });

  it('adoption approved + verification rejected → "approved_kyc_rejected"', () => {
    expect(
      deriveChatPhase({
        ...baseInput,
        requestStatus: 'approved',
        isRequesterVerified: false,
        verificationStatus: 'rejected',
      }),
    ).toBe('approved_kyc_rejected');
  });

  it('adoption approved + verification approved but is_verified=false (race) → "approved"', () => {
    // If admin approved but the cached user record still says false, trust verification.
    expect(
      deriveChatPhase({
        ...baseInput,
        requestStatus: 'approved',
        isRequesterVerified: false,
        verificationStatus: 'approved',
      }),
    ).toBe('approved');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npx jest --config jest.config.js src/utils/chatPhase.test.ts -v
```

Expected: FAIL — "Cannot find module './chatPhase'".

- [ ] **Step 3: Write the implementation**

Create `src/utils/chatPhase.ts`:

```ts
import type { ChatPhase } from '../services/api';

export type DeriveChatPhaseInput = {
  requestKind: 'adoption' | 'breeding';
  requestStatus: 'pending' | 'approved' | 'rejected';
  isActive: boolean;                                         // chat room.is_active
  isRequester: boolean;                                      // current user is the requester
  isRequesterVerified: boolean;                              // user.is_verified for the requester
  verificationStatus?: 'pending' | 'approved' | 'rejected';  // verification doc admin state
};

export const deriveChatPhase = (input: DeriveChatPhaseInput): ChatPhase => {
  if (input.requestStatus === 'rejected' || !input.isActive) return 'rejected';
  if (input.requestStatus === 'pending') return 'pending';

  // requestStatus === 'approved' below.
  if (input.requestKind === 'breeding') return 'approved';

  // Adoption KYC ladder. Trust verificationStatus over the cached is_verified flag.
  if (input.verificationStatus === 'approved' || input.isRequesterVerified) return 'approved';
  if (input.verificationStatus === 'pending') return 'approved_kyc_pending_review';
  if (input.verificationStatus === 'rejected') return 'approved_kyc_rejected';
  return 'approved_pending_kyc';
};
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
npx jest --config jest.config.js src/utils/chatPhase.test.ts -v
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/chatPhase.ts src/utils/chatPhase.test.ts
git commit -m "$(cat <<'EOF'
feat(chat-v2): add deriveChatPhase pure function with full coverage

Single source of truth for which UI state ChatScreen renders. Stage 1
derives client-side from existing API fields; Stage 2 will prefer
inline server chat_status when present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `ChatStatusBanner` component

**Files:**
- Create: `src/screens/chat/components/ChatStatusBanner.tsx`

- [ ] **Step 1: Create the component file**

Create `src/screens/chat/components/ChatStatusBanner.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ChatPhase } from '../../../services/api';

type Props = {
  phase: ChatPhase;
  perspective: 'requester' | 'owner';
  onStartKyc?: () => void;
  onRetryKyc?: () => void;
  rejectionReason?: string; // KYC admin notes
};

const palette: Record<ChatPhase, { bg: string; text: string; iconColor: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', iconColor: '#92400E' },
  approved: { bg: '#D1FAE5', text: '#065F46', iconColor: '#065F46' },
  approved_pending_kyc: { bg: '#DBEAFE', text: '#1E3A8A', iconColor: '#1E3A8A' },
  approved_kyc_pending_review: { bg: '#FEF3C7', text: '#92400E', iconColor: '#92400E' },
  approved_kyc_rejected: { bg: '#FEE2E2', text: '#991B1B', iconColor: '#991B1B' },
  rejected: { bg: '#E5E7EB', text: '#374151', iconColor: '#374151' },
};

const labelFor = (phase: ChatPhase, perspective: 'requester' | 'owner'): string => {
  if (phase === 'pending') return '⏳ هذا الطلب قيد المراجعة';
  if (phase === 'approved') return '✅ تم قبول الطلب';
  if (phase === 'rejected') return '🗂 لم يتم قبول هذا الطلب';
  if (phase === 'approved_pending_kyc') {
    return perspective === 'requester'
      ? '🪪 ارفع هويتك لبدء المحادثة'
      : '🪪 في انتظار توثيق المتقدم';
  }
  if (phase === 'approved_kyc_pending_review') {
    return perspective === 'requester'
      ? '⏳ مستندات التوثيق قيد المراجعة'
      : '⏳ قيد مراجعة المستندات';
  }
  if (phase === 'approved_kyc_rejected') {
    return perspective === 'requester'
      ? '✗ لم يتم قبول مستندات التوثيق'
      : '✗ لم تُقبل مستندات المتقدم';
  }
  return '';
};

const ChatStatusBanner: React.FC<Props> = ({
  phase,
  perspective,
  onStartKyc,
  onRetryKyc,
  rejectionReason,
}) => {
  const colors = palette[phase];
  const label = labelFor(phase, perspective);
  if (!label) return null;

  const showKycCta =
    perspective === 'requester' && phase === 'approved_pending_kyc' && !!onStartKyc;
  const showRetryCta =
    perspective === 'requester' && phase === 'approved_kyc_rejected' && !!onRetryKyc;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
      {phase === 'approved_kyc_rejected' && rejectionReason ? (
        <Text style={[styles.reason, { color: colors.text }]} numberOfLines={3}>
          {rejectionReason}
        </Text>
      ) : null}
      {showKycCta ? (
        <TouchableOpacity onPress={onStartKyc} style={styles.cta}>
          <Text style={styles.ctaText}>ابدأ التوثيق</Text>
        </TouchableOpacity>
      ) : null}
      {showRetryCta ? (
        <TouchableOpacity onPress={onRetryKyc} style={styles.cta}>
          <Text style={styles.ctaText}>أعد المحاولة</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default React.memo(ChatStatusBanner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  reason: { width: '100%', fontSize: 12, fontStyle: 'italic', textAlign: 'right' },
  cta: { backgroundColor: '#1E3A8A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep ChatStatusBanner | head -10
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/screens/chat/components/ChatStatusBanner.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): add ChatStatusBanner component

Renders the phase-aware banner above the chat message list. Different
labels per perspective (requester vs owner) and per KYC sub-state.
CTA buttons for KYC start and retry surface only on the requester side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — `RequestSystemCard` component

**Files:**
- Create: `src/screens/chat/components/RequestSystemCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/screens/chat/components/RequestSystemCard.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type AdoptionPayload = {
  kind: 'adoption';
  housingType?: string;
  hasExperience?: boolean;
  experienceText?: string;
  notes?: string;
  feedingPlan?: string;
  exercisePlan?: string;
  vetCarePlan?: string;
  emergencyPlan?: string;
};

type BreedingPayload = {
  kind: 'breeding';
  myPetName?: string;
  meetingDate?: string;
  notes?: string;
};

export type RequestSystemCardPayload = AdoptionPayload | BreedingPayload;

type Props = {
  payload: RequestSystemCardPayload;
  defaultCollapsed?: boolean;
};

const renderRow = (label: string, value: string | undefined) => {
  if (!value) return null;
  return (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value}</Text>
    </View>
  );
};

const RequestSystemCard: React.FC<Props> = ({ payload, defaultCollapsed = false }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const title = payload.kind === 'adoption' ? '📋 طلب تبني' : '📋 طلب تزاوج';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => setCollapsed(c => !c)}
        accessibilityRole="button"
        style={styles.header}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.toggle}>{collapsed ? 'عرض التفاصيل' : 'إخفاء'}</Text>
      </TouchableOpacity>
      {collapsed ? null : (
        <View style={styles.body}>
          {payload.kind === 'adoption' ? (
            <>
              {renderRow('نوع السكن', payload.housingType)}
              {renderRow(
                'خبرة سابقة',
                payload.hasExperience
                  ? payload.experienceText || 'نعم'
                  : payload.hasExperience === false
                  ? 'لا'
                  : undefined,
              )}
              {renderRow('خطة التغذية', payload.feedingPlan)}
              {renderRow('خطة التمارين', payload.exercisePlan)}
              {renderRow('الرعاية البيطرية', payload.vetCarePlan)}
              {renderRow('خطة الطوارئ', payload.emergencyPlan)}
              {renderRow('ملاحظات', payload.notes)}
            </>
          ) : (
            <>
              {renderRow('الحيوان المختار', payload.myPetName)}
              {renderRow('موعد اللقاء المقترح', payload.meetingDate)}
              {renderRow('ملاحظات', payload.notes)}
            </>
          )}
        </View>
      )}
    </View>
  );
};

export default React.memo(RequestSystemCard);

const styles = StyleSheet.create({
  card: {
    margin: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  toggle: { fontSize: 12, color: '#1E3A8A', fontWeight: '600' },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  row: { flexDirection: 'column', gap: 2 },
  rowLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right' },
  rowValue: { fontSize: 13, color: '#111827', textAlign: 'right' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep RequestSystemCard | head -10
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/screens/chat/components/RequestSystemCard.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): add RequestSystemCard collapsible pinned card

Renders the request payload at the top of the chat. Adoption variant
shows housing/experience/plans/notes; breeding variant shows the
selected mate, meeting date, and notes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — `OwnerActionBar` component

**Files:**
- Create: `src/screens/chat/components/OwnerActionBar.tsx`

- [ ] **Step 1: Create the component**

Create `src/screens/chat/components/OwnerActionBar.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

type Props = {
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  disabled?: boolean;
};

const OwnerActionBar: React.FC<Props> = ({ onApprove, onReject, disabled }) => {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const wrap = (kind: 'approve' | 'reject', fn: () => Promise<void> | void) => async () => {
    if (busy || disabled) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={[styles.button, styles.reject]}
        onPress={wrap('reject', onReject)}
        disabled={!!busy || !!disabled}
        accessibilityRole="button"
        accessibilityLabel="رفض"
      >
        {busy === 'reject' ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>✕  رفض</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.approve]}
        onPress={wrap('approve', onApprove)}
        disabled={!!busy || !!disabled}
        accessibilityRole="button"
        accessibilityLabel="قبول"
      >
        {busy === 'approve' ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>✓  قبول</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default OwnerActionBar;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approve: { backgroundColor: '#16A34A' },
  reject: { backgroundColor: '#B91C1C' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep OwnerActionBar | head -10
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/screens/chat/components/OwnerActionBar.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): add OwnerActionBar approve/reject pair

Sticky bottom bar shown to the owner when the chat phase is 'pending'.
Both actions disable while in flight; state resets on completion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Extract `VerificationFormBody`

**Files:**
- Create: `src/screens/profile/VerificationFormBody.tsx`
- Modify: `src/screens/profile/VerificationScreen.tsx`

- [ ] **Step 1: Read VerificationScreen to identify the form region**

```bash
sed -n '20,30p' src/screens/profile/VerificationScreen.tsx          # state declarations
sed -n '50,95p' src/screens/profile/VerificationScreen.tsx          # submit handler + helpers
sed -n '230,320p' src/screens/profile/VerificationScreen.tsx        # form JSX
```

Expected:
- Lines ~25-26: `idPhoto` and `selfieVideo` state declarations.
- Lines ~51-91: `handleSubmit` calling `apiService.submitVerification(idPhoto, selfieVideo)`.
- Lines ~243-304: the JSX block containing the `<ImagePicker>` for the ID photo, the preview `<Image>`, and the `<VideoPicker>` + `<Video>` preview for the selfie video.
- A submit `<TouchableOpacity>` button immediately following (around line 305-320).

The form region to extract = the state declarations + submit handler + that JSX block + the submit button.

- [ ] **Step 2: Create `VerificationFormBody` with the extracted form**

Create `src/screens/profile/VerificationFormBody.tsx`. It must export a body-only component that receives:
- `onSubmitted: () => void` — called after successful submit
- `onCancel?: () => void` — optional cancel handler

The body renders the same `idPhoto` + `selfieVideo` upload UI and submit button. Move the `onPress`, `apiService.submitVerification`, validation, and loading state from `VerificationScreen` into this body. Keep the styles co-located. Follow the existing visual layout exactly — this is a pure refactor.

**How to construct the file:**

1. Open `src/screens/profile/VerificationScreen.tsx`.
2. Copy the imports your form JSX needs (`ImagePicker`, `VideoPicker`, `Video`, `AppIcon`, plus React/RN primitives, `apiService`).
3. Inside the new component, declare the same hooks the original uses for the form: `idPhoto`, `selfieVideo`, `isPlaying`, `videoRef`, plus `submitting`. Move `handleSubmit` (lines ~51-91 of the original) verbatim, but on success call `onSubmitted()` instead of toggling local "show status" state.
4. Render the JSX block from lines ~243-304 of the original (the two `<View style={styles.section}>` blocks) followed by a submit button.
5. If `onCancel` is provided, render an extra "إلغاء" button below the submit (used by the bottom-sheet host).
6. **Style entries (`section`, `sectionTitle`, `preview`, `videoPreviewContainer`, `videoPlayerWrap`, `videoPlayer`, `playOverlay`, `playButtonCircle`, `videoInfoRow`, `videoInfoText`, `reRecordButton`, `reRecordButtonText`) must be COPIED VERBATIM** from `VerificationScreen.tsx` into this new file's StyleSheet so the visual is identical.

```tsx
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Image, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import ImagePicker from '../../components/ImagePicker';
import VideoPicker from '../../components/VideoPicker';
import AppIcon from '../../components/icons/AppIcon';
import { apiService } from '../../services/api';

type MediaAsset = { uri: string; fileSize?: number };

type Props = {
  onSubmitted: () => void;
  onCancel?: () => void;
};

const VerificationFormBody: React.FC<Props> = ({ onSubmitted, onCancel }) => {
  const [idPhoto, setIdPhoto] = useState<MediaAsset | null>(null);
  const [selfieVideo, setSelfieVideo] = useState<MediaAsset | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<any>(null);

  const toggleVideoPlayback = () => setIsPlaying((p) => !p);

  const handleSubmit = async () => {
    if (!idPhoto || !selfieVideo) {
      Alert.alert('بيانات ناقصة', 'يرجى رفع صورة الهوية وفيديو السيلفي.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiService.submitVerification(idPhoto, selfieVideo);
      if (res.success) {
        onSubmitted();
      } else {
        Alert.alert('تعذر الإرسال', res.error || 'يرجى المحاولة لاحقًا.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>صورة بطاقة الهوية *</Text>
        <ImagePicker
          onImageSelected={setIdPhoto}
          placeholder="اختر صورة بطاقة الهوية"
          maxImages={1}
        />
        {idPhoto ? <Image source={{ uri: idPhoto.uri }} style={styles.preview} /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>فيديو سيلفي مع الهوية *</Text>
        <VideoPicker
          onVideoSelected={setSelfieVideo}
          placeholder="صور فيديو سيلفي مع الهوية"
          maxDuration={15}
        />
        {selfieVideo ? (
          <View style={styles.videoPreviewContainer}>
            <View style={styles.videoPlayerWrap}>
              <Video
                ref={videoRef}
                source={{ uri: selfieVideo.uri }}
                style={styles.videoPlayer}
                resizeMode="contain"
                paused={!isPlaying}
                onError={() => { Alert.alert('خطأ', 'تعذر تشغيل الفيديو'); setIsPlaying(false); }}
                onEnd={() => setIsPlaying(false)}
                repeat={false}
              />
              <TouchableOpacity style={styles.playOverlay} onPress={toggleVideoPlayback} activeOpacity={0.7}>
                <View style={styles.playButtonCircle}>
                  <AppIcon name={isPlaying ? 'close' : 'search'} size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.videoInfoRow}>
              <Text style={styles.videoInfoText}>
                تم حفظ الفيديو
                {selfieVideo.fileSize ? ` • ${(selfieVideo.fileSize / (1024 * 1024)).toFixed(1)} MB` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.reRecordButton}
              onPress={() => { setSelfieVideo(null); setIsPlaying(false); }}
            >
              <Text style={styles.reRecordButtonText}>إعادة التصوير</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <TouchableOpacity onPress={handleSubmit} disabled={submitting} style={styles.submit}>
        {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>إرسال للمراجعة</Text>}
      </TouchableOpacity>
      {onCancel ? (
        <TouchableOpacity onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>إلغاء</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default VerificationFormBody;

const styles = StyleSheet.create({
  // Copy these style entries VERBATIM from VerificationScreen.tsx so the
  // visual is identical — keys: section, sectionTitle, preview,
  // videoPreviewContainer, videoPlayerWrap, videoPlayer, playOverlay,
  // playButtonCircle, videoInfoRow, videoInfoText, reRecordButton,
  // reRecordButtonText.
  container: { padding: 16, gap: 12 },
  submit: { backgroundColor: '#1E3A8A', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#6B7280', fontSize: 14 },
});
```

- [ ] **Step 3: Update `VerificationScreen` to compose the body**

Edit `src/screens/profile/VerificationScreen.tsx`:
- Remove the local copies of: `idPhoto` / `selfieVideo` state, the upload UI JSX, the submit handler.
- Replace the form region with `<VerificationFormBody onSubmitted={...} />`. The `onSubmitted` callback should keep the existing post-submit behavior (showing the "pending" status card).
- Leave the screen header, the status card, the rejection-reason display intact.

- [ ] **Step 4: Type-check**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep -E "Verification" | head -20
```

Expected: empty.

- [ ] **Step 5: Smoke test the standalone screen**

Run the app (`npm start` then `npm run android` / `npm run ios`), navigate to Profile → Verification, confirm the screen still renders and behaves identically to before.

- [ ] **Step 6: Commit**

```bash
git add src/screens/profile/VerificationFormBody.tsx src/screens/profile/VerificationScreen.tsx
git commit -m "$(cat <<'EOF'
refactor(verification): extract VerificationFormBody

Pure refactor of VerificationScreen so the form (national ID photo +
selfie video + submit) lives in a reusable component. The screen still
renders the status card and rejection notes; the new body is composed
inside it. Sets up the bottom-sheet variant in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — `VerificationFormSheet` bottom sheet

**Files:**
- Create: `src/screens/chat/components/VerificationFormSheet.tsx`

- [ ] **Step 1: Confirm `react-native-modal` is available (or use built-in Modal)**

```bash
grep -E "\"react-native-modal\"" package.json
```

If present, use it. Otherwise use React Native's built-in `Modal` with `transparent` + `animationType="slide"`.

- [ ] **Step 2: Create the sheet**

Create `src/screens/chat/components/VerificationFormSheet.tsx`:

```tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import VerificationFormBody from '../../profile/VerificationFormBody';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

const VerificationFormSheet: React.FC<Props> = ({ visible, onClose, onSubmitted }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>توثيق الهوية</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <VerificationFormBody
            onSubmitted={() => {
              onSubmitted();
              onClose();
            }}
            onCancel={onClose}
          />
        </View>
      </View>
    </Modal>
  );
};

export default VerificationFormSheet;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    maxHeight: '90%',
  },
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  close: { fontSize: 18, color: '#6B7280' },
});
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep VerificationFormSheet | head -10
git add src/screens/chat/components/VerificationFormSheet.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): add VerificationFormSheet bottom-sheet wrapper

Wraps VerificationFormBody in a slide-up modal so the requester can
submit KYC docs without leaving the chat thread. Auto-closes on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — ChatScreen: read phase + render banner (flag-gated, owner-side wired in Task 10)

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx`

- [ ] **Step 1: Read ChatScreen header / chat-room load**

```bash
grep -n "useFeatureFlags\|chatRoom\|chat_status\|breeding_request_status\|adoption_request\|other_participant" src/screens/chat/ChatScreen.tsx | head -20
```

- [ ] **Step 2: Import deps**

Add to the top of `ChatScreen.tsx` (preserve existing imports):

```ts
import { useFeatureFlags } from '../../services/featureFlags';
import { deriveChatPhase } from '../../utils/chatPhase';
import type { ChatPhase } from '../../services/api';
import ChatStatusBanner from './components/ChatStatusBanner';
```

- [ ] **Step 3: Compute phase inside the component**

Locate where the chat-room and current user are already known (after the existing data load). Add:

```tsx
const { requestChatV2Enabled } = useFeatureFlags();
const [verificationStatus, setVerificationStatus] = useState<'pending' | 'approved' | 'rejected' | undefined>(undefined);

useEffect(() => {
  if (!requestChatV2Enabled) return;
  let cancelled = false;
  apiService.getVerificationStatus().then((res) => {
    if (cancelled) return;
    if (res.success && res.data?.verification?.status) {
      setVerificationStatus(res.data.verification.status as any);
    }
  }).catch(() => {});
  return () => { cancelled = true; };
}, [requestChatV2Enabled]);

const phase: ChatPhase = useMemo(() => {
  // Stage 1: derive locally. Stage 2: prefer chatRoom?.chat_status if present.
  if (chatRoom?.chat_status) return chatRoom.chat_status;
  const requestStatus =
    (chatRoom as any)?.adoption_request?.status ||
    (chatRoom as any)?.breeding_request?.status ||
    'pending';
  const requestKind = (chatRoom as any)?.adoption_request ? 'adoption' : 'breeding';
  return deriveChatPhase({
    requestKind,
    requestStatus,
    isActive: chatRoom?.is_active ?? true,
    isRequester: currentUser?.id === (chatRoom as any)?.requester?.id,
    isRequesterVerified: !!(chatRoom as any)?.requester?.is_verified,
    verificationStatus,
  });
}, [chatRoom, currentUser, verificationStatus]);

const perspective: 'requester' | 'owner' =
  currentUser?.id === (chatRoom as any)?.requester?.id ? 'requester' : 'owner';
```

(Adjust property accessors to match the *actual* field names in the chat-room payload you see at runtime — the explore captured `other_participant` patterns, but the canonical names depend on `getChatRoomByFirebaseId` payload shape. Inspect at runtime + match.)

- [ ] **Step 4: Render the banner above the message list**

Find the JSX where the message `FlatList` lives. Above it, add:

```tsx
{requestChatV2Enabled ? (
  <ChatStatusBanner phase={phase} perspective={perspective} />
) : null}
```

This is the simplest possible mount — KYC CTAs and approve/reject buttons get wired in Task 10 and Task 11.

- [ ] **Step 5: Smoke test with the flag ON**

In `src/services/config.ts`, uncomment or add `requestChatV2Enabled: true` inside `LOCAL_FEATURE_OVERRIDES`. Reload Metro. Open any existing chat. Confirm the banner appears with the right color/label for the chat's phase. Re-comment the flag (`requestChatV2Enabled: false`) before commit.

- [ ] **Step 6: Type-check + commit**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep ChatScreen | head -10
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): mount ChatStatusBanner in ChatScreen behind flag

Reads chat phase from server (Stage 2) or derives locally (Stage 1) and
renders the banner above the message list. Owner-side action bar and
KYC sheet land in follow-up tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — ChatScreen: owner approve/reject wiring

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx`

- [ ] **Step 1: Import**

```ts
import OwnerActionBar from './components/OwnerActionBar';
```

- [ ] **Step 2: Add the action bar in pending + owner perspective**

Locate the existing input bar JSX. Wrap it so the owner sees the action bar instead when `requestChatV2Enabled && phase === 'pending' && perspective === 'owner'`:

```tsx
{requestChatV2Enabled && phase === 'pending' && perspective === 'owner' ? (
  <OwnerActionBar
    onApprove={async () => {
      const adoptionId = (chatRoom as any)?.adoption_request?.id;
      const breedingId = (chatRoom as any)?.breeding_request?.id;
      if (adoptionId) {
        await apiService.respondToAdoptionRequest(adoptionId, 'approve');
      } else if (breedingId) {
        await apiService.respondToBreedingRequest(breedingId, 'approve');
      }
      await reloadChatRoom();
    }}
    onReject={async () => {
      const adoptionId = (chatRoom as any)?.adoption_request?.id;
      const breedingId = (chatRoom as any)?.breeding_request?.id;
      if (adoptionId) {
        await apiService.respondToAdoptionRequest(adoptionId, 'reject');
      } else if (breedingId) {
        await apiService.respondToBreedingRequest(breedingId, 'reject');
      }
      if (chatRoom?.id) {
        await apiService.archiveChatRoom(chatRoom.id);
      }
      await reloadChatRoom();
    }}
  />
) : (
  <YourExistingInputBarJSX />
)}
```

`reloadChatRoom` is a function you'll likely already have (or add) — re-fetches chat data so the phase recomputes after the action.

- [ ] **Step 3: Smoke test (flag on)**

As the owner: open a `pending` chat → see the قبول / رفض bar at the bottom (no input bar). Tap قبول → bar disappears, banner flips green. Tap رفض on a separate chat → banner flips grey, input gone, chat archived.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | grep ChatScreen | head -10
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): wire OwnerActionBar approve/reject in ChatScreen

Owner sees the action bar (instead of the message input) while the
chat is pending. Reject also archives the chat for soft-close per spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — ChatScreen: input gating per phase

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx`

- [ ] **Step 1: Compute `inputEnabled`**

Below the existing `phase` memo, add:

```tsx
const inputEnabled = useMemo(() => {
  if (!requestChatV2Enabled) return true;  // legacy behavior
  if (phase === 'approved') return true;
  return false;  // pending, kyc-pending, kyc-rejected, kyc-pending-review, rejected
}, [requestChatV2Enabled, phase]);
```

- [ ] **Step 2: Apply to the input bar**

Find the existing input JSX. For the requester perspective in non-approved phases, replace the input with a locked placeholder. For the owner perspective in `pending`, the OwnerActionBar from Task 10 already takes its place — keep that.

```tsx
{requestChatV2Enabled && !inputEnabled && perspective === 'requester' ? (
  <View style={{ padding: 14, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
    <Text style={{ color: '#6B7280', fontSize: 13 }}>
      🔒 لا يمكن إرسال رسائل قبل قبول الطلب
    </Text>
  </View>
) : null}

{requestChatV2Enabled && phase === 'rejected' ? null : null /* no input at all when rejected */}

{(!requestChatV2Enabled || (inputEnabled && perspective === 'requester')) ? (
  <YourExistingInputBarJSX />
) : null}
```

(Translate to whatever the actual JSX looks like — the spirit: input bar shows only when the user is allowed to type.)

- [ ] **Step 3: Smoke test all phases**

With flag on, walk all six phases:
- `pending` (requester): locked banner shows, no input, no action bar.
- `pending` (owner): action bar shows, no input.
- `approved` (both): input bar shows.
- `approved_pending_kyc` (requester): banner with CTA shows, input locked.
- `approved_kyc_rejected` (requester): banner with retry shows, input locked.
- `rejected` (both): no input area at all.

- [ ] **Step 4: Type-check + commit**

```bash
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): gate ChatScreen input per phase

Locks the input bar with a placeholder when the requester can't yet
send messages; removes it entirely when the chat is rejected. Owner
input is replaced by OwnerActionBar in pending state; otherwise the
input is unchanged for the owner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — ChatScreen: KYC sheet + retry

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx`

- [ ] **Step 1: Imports + state**

```ts
import VerificationFormSheet from './components/VerificationFormSheet';
```

```tsx
const [showKycSheet, setShowKycSheet] = useState(false);
```

- [ ] **Step 2: Pass onStartKyc / onRetryKyc to the banner**

Update the banner usage:

```tsx
<ChatStatusBanner
  phase={phase}
  perspective={perspective}
  onStartKyc={() => setShowKycSheet(true)}
  onRetryKyc={() => setShowKycSheet(true)}
  rejectionReason={
    phase === 'approved_kyc_rejected'
      ? (chatRoom as any)?.requester?.verification?.admin_notes
      : undefined
  }
/>
```

- [ ] **Step 3: Mount the sheet**

Below the message list, render:

```tsx
{requestChatV2Enabled ? (
  <VerificationFormSheet
    visible={showKycSheet}
    onClose={() => setShowKycSheet(false)}
    onSubmitted={async () => {
      // refresh verification status so phase advances to kyc_pending_review
      const res = await apiService.getVerificationStatus();
      if (res.success && res.data?.verification?.status) {
        setVerificationStatus(res.data.verification.status as any);
      }
    }}
  />
) : null}
```

- [ ] **Step 4: Smoke test**

Flag on, as a non-verified requester, force `phase === 'approved_pending_kyc'`. Tap CTA → sheet slides up → submit dummy ID + selfie → sheet closes → banner flips to "قيد المراجعة".

- [ ] **Step 5: Commit**

```bash
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): mount VerificationFormSheet behind banner CTA

Tapping "ابدأ التوثيق" or "أعد المحاولة" now slides the KYC form up
inside the chat. Submission updates the local verification status so
the phase advances without leaving the screen.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 — ChatScreen: pinned RequestSystemCard

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx`

- [ ] **Step 1: Build the payload**

Above the message-list JSX, add a memoized payload:

```tsx
const requestCardPayload = useMemo(() => {
  if (!requestChatV2Enabled) return null;
  const adoption = (chatRoom as any)?.adoption_request;
  const breeding = (chatRoom as any)?.breeding_request;
  if (adoption) {
    return {
      kind: 'adoption' as const,
      housingType: adoption.housing_type,
      hasExperience: adoption.has_experience,
      experienceText: adoption.experience_text,
      notes: adoption.notes,
      feedingPlan: adoption.feeding_plan,
      exercisePlan: adoption.exercise_plan,
      vetCarePlan: adoption.vet_care_plan,
      emergencyPlan: adoption.emergency_plan,
    };
  }
  if (breeding) {
    return {
      kind: 'breeding' as const,
      myPetName: breeding.requester_pet?.name,
      meetingDate: breeding.meeting_date,
      notes: breeding.notes,
    };
  }
  return null;
}, [chatRoom, requestChatV2Enabled]);
```

(Adjust field names — the actual chat-room payload schema may use `housing_type` or different casing; the snake-case above matches Django REST conventions but verify before merging.)

- [ ] **Step 2: Render below the banner, above the message list**

```tsx
import RequestSystemCard from './components/RequestSystemCard';
// ...
{requestChatV2Enabled && requestCardPayload ? (
  <RequestSystemCard
    payload={requestCardPayload}
    defaultCollapsed={phase === 'approved' /* once approved, save scroll */}
  />
) : null}
```

- [ ] **Step 3: Smoke test + commit**

Flag on. Confirm pinned card appears with the right fields per request type. Toggle expand/collapse.

```bash
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): pin RequestSystemCard at the top of the chat

Adoption variant lists housing/plans/notes; breeding variant lists the
selected pet, meeting date, and notes. Defaults collapsed once the chat
is approved to save vertical space.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14 — `AdoptionRequestScreen.onSuccess` returns chat-room id

**Files:**
- Modify: `src/screens/adoption-request/AdoptionRequestScreen.tsx`

- [ ] **Step 1: Update the prop type**

```ts
interface AdoptionRequestScreenProps {
  // ...
  onSuccess?: (firebaseChatId?: string) => void;
}
```

- [ ] **Step 2: After `createAdoptionRequest`, fetch / wait for the chat room**

Inside the `if (response.success)` block (around line 231), before invoking `onSuccess`:

```ts
let firebaseChatId: string | undefined;
const requestId = response.data?.id ?? response.data?.request?.id;
if (requestId) {
  // Stage 2 will return chat_room inline; Stage 1 waits for backend lazy-create.
  // Try direct lookup first; if missing, attempt explicit create.
  const lookup = await apiService.getChatRoomByAdoptionRequest(requestId);
  if (lookup.success && lookup.data?.firebase_chat_id) {
    firebaseChatId = lookup.data.firebase_chat_id;
  } else {
    const created = await apiService.createAdoptionChatRoom(requestId);
    firebaseChatId = created.success ? created.data?.chat_room?.firebase_chat_id : undefined;
  }
}
```

Then the existing alert call:

```ts
Alert.alert(
  'تم الإرسال بنجاح',
  'تم إرسال طلب التبني بنجاح. سيتم مراجعته من قبل صاحب الحيوان.',
  [
    {
      text: 'حسناً',
      onPress: () => {
        if (onSuccess) onSuccess(firebaseChatId);
        onClose();
      },
    },
  ],
);
```

- [ ] **Step 3: Type-check + commit**

```bash
git add src/screens/adoption-request/AdoptionRequestScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): adoption request submit returns firebaseChatId

Best-effort: looks up the chat room for the new request, falling back
to explicit creation. Stage 2 backend will inline this; Stage 1 keeps
the existing fallback path untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15 — `BreedingRequestScreen.onSuccess` returns chat-room id

**Files:**
- Modify: `src/screens/breeding-request/BreedingRequestScreen.tsx`

- [ ] **Step 1: Update prop type**

```ts
type BreedingRequestScreenProps = {
  // ...
  onSuccess?: (firebaseChatId?: string) => void;
};
```

- [ ] **Step 2: After `createBreedingRequest` (line 437), look up / create the chat room**

Apply the same pattern as Task 14, with the breeding endpoints:

```ts
let firebaseChatId: string | undefined;
const requestId = response.data?.id ?? response.data?.request?.id;
if (requestId) {
  const lookup = await apiService.getChatRoomByBreedingRequest(requestId);
  if (lookup.success && lookup.data?.firebase_chat_id) {
    firebaseChatId = lookup.data.firebase_chat_id;
  } else {
    const created = await apiService.createChatRoom(requestId);
    firebaseChatId = created.success ? created.data?.chat_room?.firebase_chat_id : undefined;
  }
}
// ... existing success Alert; pass firebaseChatId to onSuccess.
```

- [ ] **Step 3: Type-check + commit**

```bash
git add src/screens/breeding-request/BreedingRequestScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): breeding request submit returns firebaseChatId

Mirrors the adoption flow: lookup or create the chat room and pass
its firebase id back through onSuccess so callers can navigate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16 — Thread `onOpenChat` through `PetDetailsScreen`

**Files:**
- Modify: `src/screens/pets/PetDetailsScreen.tsx`

- [ ] **Step 1: Update prop type**

```ts
interface PetDetailsScreenProps {
  petId: number;
  onClose: () => void;
  onAddPet?: () => void;
  onOpenChat?: (firebaseChatId: string) => void;  // NEW
}
```

- [ ] **Step 2: Forward to children**

Find the `<AdoptionRequestScreen>` and `<BreedingRequestScreen>` JSX (around lines 295-308). Update the `onSuccess` prop:

```tsx
<BreedingRequestScreen
  onClose={hideBreedingRequest}
  onSuccess={(firebaseChatId) => {
    hideBreedingRequest();
    if (firebaseChatId && onOpenChat) {
      onClose();          // close the pet details
      onOpenChat(firebaseChatId);
    }
  }}
  /* ... */
/>

<AdoptionRequestScreen
  onClose={hideAdoptionRequest}
  onSuccess={(firebaseChatId) => {
    hideAdoptionRequest();
    if (firebaseChatId && onOpenChat) {
      onClose();
      onOpenChat(firebaseChatId);
    }
  }}
  /* ... */
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/screens/pets/PetDetailsScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): wire onOpenChat through PetDetailsScreen

After a successful request submission, close pet details and bubble
the firebase chat id up so the host (HomeScreen) can open the new chat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17 — Wire `onOpenChat` from `HomeScreen` into pet details

**Files:**
- Modify: `src/screens/main/HomeScreen.tsx`

- [ ] **Step 1: Find where `<PetDetailsScreen>` is rendered**

```bash
grep -n "<PetDetailsScreen\|selectedPetId" src/screens/main/HomeScreen.tsx | head -10
```

- [ ] **Step 2: Pass `onOpenChat`**

```tsx
<PetDetailsScreen
  petId={selectedPetId}
  onClose={() => setSelectedPetId(null)}
  onAddPet={() => /* existing */}
  onOpenChat={(firebaseChatId) => {
    setInitialChatFirebaseId(firebaseChatId);
    setShowChatList(true);
  }}
/>
```

(The existing `setInitialChatFirebaseId` + `setShowChatList(true)` machinery is the same plumbing the inbox screens use today — see HomeScreen.tsx around the `showChatList` state.)

- [ ] **Step 3: Smoke test**

Flag ON. From Home → tap a pet → request adoption → submit form → confirm:
1. Alert appears.
2. Tap "حسناً" → modal closes → ChatList opens with the new chat selected → ChatScreen renders in `pending` state.

Repeat for breeding.

- [ ] **Step 4: Commit**

```bash
git add src/screens/main/HomeScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): HomeScreen routes onOpenChat to its existing chat list

Reuses the showChatList + initialChatFirebaseId machinery to land the
user inside the new chat thread immediately after submitting a request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18 — Demote `AdoptionRequestsScreen` (flag-gated)

**Files:**
- Modify: `src/screens/adoption-request/AdoptionRequestsScreen.tsx`

- [ ] **Step 1: Read current `handleStartChat`**

```bash
sed -n '106,140p' src/screens/adoption-request/AdoptionRequestsScreen.tsx
```

- [ ] **Step 2: Behind the flag, replace the "Start Chat" button with a "Open in Chat List" pointer**

Add at the top of the component:

```tsx
const { requestChatV2Enabled } = useFeatureFlags();
```

In the `renderRequest` JSX (around line 184), where the button is rendered for `request.status === 'approved'` (around line 297-306):

```tsx
{requestChatV2Enabled ? (
  <TouchableOpacity onPress={() => onOpenChatList?.()}>
    <Text style={styles.linkText}>افتح المحادثة في القائمة</Text>
  </TouchableOpacity>
) : (
  <TouchableOpacity onPress={() => handleStartChat(request)}>
    <Text style={styles.linkText}>ابدأ المحادثة</Text>
  </TouchableOpacity>
)}
```

(`onOpenChatList` is a callback passed from the host. If it doesn't exist, add it as an optional prop and wire from HomeScreen to call `setShowChatList(true)`.)

- [ ] **Step 3: Add the demote banner at the top**

Just below the header in `AdoptionRequestsScreen`, when flag is on:

```tsx
{requestChatV2Enabled ? (
  <View style={{ backgroundColor: '#DBEAFE', padding: 12, marginHorizontal: 12, borderRadius: 8, marginBottom: 8 }}>
    <Text style={{ fontSize: 13, color: '#1E3A8A', textAlign: 'right' }}>
      جميع المحادثات الآن في تبويب الدردشة. هذه الصفحة سجل تاريخي لطلباتك.
    </Text>
  </View>
) : null}
```

- [ ] **Step 4: Type-check + commit**

```bash
git add src/screens/adoption-request/AdoptionRequestsScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): demote AdoptionRequestsScreen behind flag

Replaces the inline 'Start Chat' button with a pointer to the chat
list and adds a banner explaining the new primary surface. Old
behavior preserved when the flag is off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19 — Push handler: route `*_received` notifications to chat (flag-gated)

**Files:**
- Modify: `src/services/notifications.ts`

- [ ] **Step 1: Read the deeplink builder**

```bash
sed -n '180,215p' src/services/notifications.ts
```

Expected: `buildDeepLinkFromPayload(data)` (line 181). Today, when the notification type is in `BREEDING_NOTIFICATION_TYPES` it returns `petow://breeding-requests?...`; for `ADOPTION_NOTIFICATION_TYPES` it returns `petow://adoption-requests?...`. Chat-type notifications return `petow://clinic-chat?firebase_chat_id=...` (handled by `AppNavigator.tsx:161`).

- [ ] **Step 2: Add flag check + chat-deeplink override at the top of `buildDeepLinkFromPayload`**

Edit `src/services/notifications.ts`. At the top of the file add:

```ts
import { fetchFeatureFlags } from './featureFlags';
```

Change `buildDeepLinkFromPayload` from a sync function to an async one that consults the flag, and return the chat deeplink early when applicable. Replace the top of the function:

```ts
async function buildDeepLinkFromPayload(data: Record<string, any>): Promise<string> {
  const payloadDeepLink = getDataValueAsString(data, ['deep_link', 'deeplink']);
  if (payloadDeepLink) {
    return payloadDeepLink;
  }

  const type = getTypeFromAny({ data }).toLowerCase();
  const firebaseChatId = getDataValueAsString(data, ['firebase_chat_id', 'chat_id', 'chat_room_id']);

  // Stage 1 + flag-on: route *_received pushes to the chat thread directly.
  if (firebaseChatId &&
      (type === 'breeding_request_received' || type === 'adoption_request_received')) {
    try {
      const flags = await fetchFeatureFlags(false);
      if (flags.requestChatV2Enabled) {
        return withQuery('petow://clinic-chat', 'firebase_chat_id', firebaseChatId);
      }
    } catch {
      // fall through to legacy inbox deeplink
    }
  }

  // ... existing branches unchanged below
```

The `petow://clinic-chat` URL is the existing chat deeplink already wired in `AppNavigator.tsx:161` — it works for any chat, not just clinic chats (despite the name).

- [ ] **Step 3: Make the call site `await` the now-async builder**

In `handleNotificationNavigationFromData` (line 302), the call is `const deepLink = buildDeepLinkFromPayload(data);` — change to `const deepLink = await buildDeepLinkFromPayload(data);`. The function is already `async`.

- [ ] **Step 3: Smoke test**

Send a test FCM payload (existing `get_fcm_token.py` script in the repo root may help):

```json
{
  "type": "adoption_request_received",
  "firebase_chat_id": "<existing chat id>",
  "data": { ... }
}
```

Confirm the app opens that chat directly (not the inbox) when the flag is on.

- [ ] **Step 4: Commit**

```bash
git add src/services/notifications.ts
git commit -m "$(cat <<'EOF'
feat(chat-v2): route *_received pushes to chat directly

When requestChatV2Enabled is true and the push payload carries a
firebase_chat_id, opens the chat thread instead of the inbox screen.
Falls back to the existing inbox path when the flag is off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20 — Demote `BreedingRequestsOverview` on HomeScreen (flag-gated)

**Files:**
- Modify: `src/screens/main/HomeScreen.tsx`

- [ ] **Step 1: Find the BreedingRequestsOverview render**

```bash
grep -n "BreedingRequestsOverview\|onOpenChat={handleOpenChatForRequest" src/screens/main/HomeScreen.tsx | head
```

- [ ] **Step 2: Wrap in flag check**

```tsx
{!requestChatV2Enabled ? (
  <BreedingRequestsOverview
    /* existing props */
  />
) : null}
```

(The breeding inbox path collapses into ChatList when the flag is on. The chat list is reachable from the same surface; no replacement needed.)

- [ ] **Step 3: Smoke test**

Flag on → HomeScreen no longer shows the breeding overview block. Open chat list → see all chats grouped together. Flag off → block reappears.

- [ ] **Step 4: Commit**

```bash
git add src/screens/main/HomeScreen.tsx
git commit -m "$(cat <<'EOF'
feat(chat-v2): hide BreedingRequestsOverview behind v2 flag

The chat list is the single inbox surface in v2; the inline overview
duplicates it. Hidden when the flag is on, untouched otherwise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21 — Stage 2 adapter: prefer inline `chat_status` when present

**Files:**
- Modify: `src/screens/chat/ChatScreen.tsx` (small)

- [ ] **Step 1: Verify the existing memo**

In Task 9 we already wrote:

```tsx
if (chatRoom?.chat_status) return chatRoom.chat_status;
```

Confirm that line is the FIRST in the `phase` memo. It is the Stage 2 hook — when backend ships the inline field, the frontend silently switches to it without any other code change. **No new commit needed if Task 9 already did this** — this task is just a verification + a marker for the Stage 2 cutover.

- [ ] **Step 2: Add a follow-up TODO comment**

Above the memo:

```tsx
// TODO(chat-v2 stage 2): once backend always returns chat_status, drop
// the local derivation below and read chatRoom.chat_status directly.
```

- [ ] **Step 3: Commit (only if the TODO was added)**

```bash
git add src/screens/chat/ChatScreen.tsx
git commit -m "$(cat <<'EOF'
chore(chat-v2): mark Stage 2 cutover spot in phase derivation

Once backend lands the inline chat_status field, the local-derivation
fallback can be deleted. Comment marks the exact spot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **All commits land cleanly:**

```bash
git log --oneline staging..HEAD
```

Expected: ~15 commits, each scoped to one task.

- [ ] **TypeScript check:**

```bash
npx tsc -p tsconfig.json --moduleResolution bundler --noEmit 2>&1 | tail -30
```

Expected: no new errors in any of the modified files.

- [ ] **Test suite:**

```bash
npx jest --config jest.config.js
```

Expected: all existing tests + new `chatPhase.test.ts` (9 tests) pass.

- [ ] **Manual smoke (end-to-end):**

Set `LOCAL_FEATURE_OVERRIDES.requestChatV2Enabled = true` in dev only.

1. Submit adoption request as **non-verified** user → land in chat (`pending`) → owner approves → KYC banner shows → tap CTA → submit ID + selfie → "قيد المراجعة" banner → admin approves (force in DB) → input unlocks.
2. Submit adoption request as **verified** user → owner approves → input unlocks immediately.
3. Submit breeding request → owner approves → input unlocks (no KYC step).
4. Owner rejects → chat archives, no input.
5. Push notification arrives → opens chat directly.
6. Old inbox screens still reachable, but the "Start Chat" button is replaced by "open in chat list" pointer.

Reset `requestChatV2Enabled` to `false` (or remove the override key) before pushing to other devs.

---

## Self-review checklist (mandatory before merging)

- [ ] **Spec coverage**
  - Architecture (chat opens at submit) → Tasks 14-17 ✓
  - Three chat states + KYC sub-states → Tasks 9-13 ✓
  - Soft-archive on rejection → Task 10 (`archiveChatRoom`) ✓
  - Push deeplink to chat → Task 19 ✓
  - KYC bottom sheet → Tasks 7-8, 12 ✓
  - Owner-side mirror banners → Task 4 (`labelFor` returns owner string) ✓
  - Old inbox demoted → Tasks 18, 20 ✓
  - Feature flag → Task 1 ✓
  - 7-day auto-archive → BACKEND ONLY (out of Stage 1 scope) ✓
  - Unified `chat_status` field → Task 21 (Stage 2 hook) ✓

- [ ] **Placeholder scan**
  - No "TBD" / "TODO: implement later" / "see Task N" without inline code.
  - Every code step has full code in the block.

- [ ] **Type consistency**
  - `ChatPhase` defined once (Task 2), used identically in `chatPhase.ts`, `ChatStatusBanner.tsx`, `ChatScreen.tsx`.
  - `requestChatV2Enabled` named identically in config, AppConfig, FeatureFlags, all consumers.
  - `onSuccess?: (firebaseChatId?: string) => void` matches between AdoptionRequestScreen, BreedingRequestScreen, and PetDetailsScreen consumers.

---

## What this plan does NOT do (explicit out-of-scope)

- Backend: chat-at-submit endpoint, drop the 403, unified `chat_status`, 7-day cron — all separate.
- React Navigation refactor — keeps the existing modal-overlay pattern.
- Component-level snapshot/render tests — would need `@testing-library/react-native`, deferred.
- Reworking adoption/breeding request *forms* — out of scope.
- Removing `AdoptionRequestsScreen` or `BreedingRequestsOverview` entirely — only demoted.
- Owner-side KYC.
