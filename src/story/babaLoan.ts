/**
 * Baba's loan: once per career, when Ryan's bank runs dry, he can call Baba for $500. Paying it back
 * is optional (no interest, no penalty). Owner request 2026-11-24.
 *
 * Every line here is approved (owner, 2026-11-27) and in Baba's canon voice (docs/story/baba/BABA_STORY_BIBLE.md): phase 1,
 * he/him, *habibi*; blunt and funny, never sentimental; his love never depends on results; he never
 * decides for Ryan. No line here misgenders anyone or mentions Mom.
 */
export const BABA_LOAN = {
  amount: 500,
  /** The card appears when the bank is under this. */
  below: 100,
  /** Paying Baba back is offered once the bank is at least this. */
  repayFrom: 1000,
} as const;

export const BABA_LOAN_STATUS: 'draft' | 'approved' = 'approved';

export const BABA_LOAN_LINES = {
  cardTitle: 'Ask Baba for help',
  cardBody: 'The bank is nearly empty. Baba said once: call if it ever gets bad. You can ask him for $500, one time.',
  call: [
    'He picks up on the second ring. He always does.',
    '"Habibi. You only call this late when something’s broken. The car or the bank?"',
    '"Five hundred. Once. I’m a groundskeeper, not a bank."',
    '"And eat something. Real food. Not those bars."',
  ],
  accept: 'Take the $500',
  decline: 'Not yet',
  declined: '"Okay. The offer doesn’t expire. Neither do I."',
  received: 'The money lands with a one-line text from Baba: "Fifty from three feet. Every day."',
  inboxTaken: 'Baba sent $500. One time, he said. He also said to eat something.',
  repayTitle: 'Pay Baba back',
  repayBody: 'You’ve got some breathing room. You could send Baba his $500 back. He won’t ask for it.',
  repay: 'Send Baba $500',
  repaid: 'Baba texts back: "Who taught you to pay your debts? Good. Now go practise your putting."',
  inboxRepaid: 'You paid Baba back. He pretended not to notice. He noticed.',
  rentHint: ' If it gets really bad, you can call Baba once.',
} as const;
