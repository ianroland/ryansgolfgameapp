import trophy from '../../assets/ui/icon_trophy.png';
import coins from '../../assets/ui/icon_coins.png';
import cart from '../../assets/ui/icon_cart.png';
import sofa from '../../assets/ui/icon_sofa.png';
import flag from '../../assets/ui/icon_flag.png';
import gear from '../../assets/ui/icon_gear.png';
import disk from '../../assets/ui/icon_disk.png';
import x from '../../assets/ui/icon_x.png';
import check from '../../assets/ui/icon_check.png';

const ICONS = { trophy, coins, cart, sofa, flag, gear, disk, x, check };
export type IconName = keyof typeof ICONS;

/** Pixel-art icon from the UI kit. Decorative unless a label is given. */
export function Icon({ name, size = 22, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <img
      src={ICONS[name]}
      className="px-icon"
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: 'auto' }}
    />
  );
}
