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
