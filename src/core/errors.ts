export type DomainErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'NOT_PURCHASABLE'
  | 'UNKNOWN_ITEM'
  | 'NOT_OWNED'
  | 'INCOMPATIBLE_ZONE'
  | 'ZONE_OCCUPIED'
  | 'RESERVED_ZONE'
  | 'UNKNOWN_ZONE'
  | 'PROPERTY_TIER_TOO_LOW'
  | 'STALE_LAYOUT'
  | 'NOT_PLACED'
  | 'NOT_A_DISPLAY'
  | 'SLOT_OUT_OF_RANGE'
  | 'SLOT_OCCUPIED'
  | 'CAPACITY_EXCEEDED'
  | 'INVALID_RESULT'
  | 'NO_PROFILE'
  | 'LEDGER_INTEGRITY'
  | 'INVALID_SAVE'
  | 'CAREER_RULE'
  | 'HOME_LOCKED';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function isDomainError(e: unknown, code?: DomainErrorCode): e is DomainError {
  return e instanceof DomainError && (code === undefined || e.code === code);
}
