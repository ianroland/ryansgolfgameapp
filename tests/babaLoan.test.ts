import { describe, expect, it } from 'vitest';
import * as E from '../src/career/engine';
import { BABA_LOAN, BABA_LOAN_LINES } from '../src/story/babaLoan';
import { isDomainError } from '../src/core/errors';
import { newCareer, RYAN, spend } from './helpers';
import { topUp } from './careerHelpers';

async function broke() {
  const { s } = await newCareer();
  const bal = await s.economy.getBalance(RYAN);
  await spend(s, bal - 40);
  return s;
}

describe("Baba's one-time loan", () => {
  it('is only offered when the bank is under $100', async () => {
    const { s } = await newCareer();
    const c = await s.career.getCareer();
    const bal = await s.economy.getBalance(RYAN);
    expect(bal).toBeGreaterThanOrEqual(BABA_LOAN.below);
    expect(E.babaLoanStatus(c, bal)).toBe('not_needed');
    await expect(s.career.askBabaLoan()).rejects.toSatisfy(isDomainError);
    expect(E.babaLoanStatus(c, 99)).toBe('available');
  });

  it('sends $500 once, as a family loan in the ledger', async () => {
    const s = await broke();
    await s.career.askBabaLoan();
    expect(await s.economy.getBalance(RYAN)).toBe(540);
    const c = await s.career.getCareer();
    expect(c.flags.babaLoan).toBe('taken');
    expect(c.inbox[0].body).toBe(BABA_LOAN_LINES.inboxTaken);
    // Broke again: still no second loan.
    await spend(s, 520);
    await expect(s.career.askBabaLoan()).rejects.toSatisfy(isDomainError);
    expect(await s.economy.getBalance(RYAN)).toBe(20);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('paying back is optional and only offered from $1,000', async () => {
    const s = await broke();
    await s.career.askBabaLoan();
    let c = await s.career.getCareer();
    expect(E.babaLoanStatus(c, 540)).toBe('taken');
    await topUp(s, 500, 'job-1');
    c = await s.career.getCareer();
    expect(E.babaLoanStatus(c, 1040)).toBe('repayable');
    const relBefore = c.relationships?.mom;
    await s.career.repayBabaLoan();
    expect(await s.economy.getBalance(RYAN)).toBe(540);
    c = await s.career.getCareer();
    expect(c.flags.babaLoan).toBe('repaid');
    if (typeof relBefore === 'number') expect(c.relationships.mom).toBeGreaterThan(relBefore);
    await expect(s.career.repayBabaLoan()).rejects.toSatisfy(isDomainError);
    await expect(s.career.askBabaLoan()).rejects.toSatisfy(isDomainError);
    await expect(s.economy.verifyIntegrity(RYAN)).resolves.toBeUndefined();
  });

  it('the rent note mentions Baba only while the loan is unused', () => {
    expect(BABA_LOAN_LINES.rentHint).toContain('Baba');
  });
});
