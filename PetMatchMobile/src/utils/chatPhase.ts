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
