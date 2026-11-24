import { formatMoney } from '../format';
import { useShownBalance } from './balanceHold';

/** The bank figure, held while a casino result is still being revealed (see balanceHold.ts). */
export function ShownBalance({ real }: { real: number }) {
  return <>{formatMoney(useShownBalance(real))}</>;
}
