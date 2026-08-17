import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { ProductLogo } from '../ui';
import { resolveSupportTheme, supportThemeVars } from '../../utils/supportTheme';
import cn from '../../utils/cn';

/**
 * The dark, full-bleed stage the customer-facing welcome and chat screens sit
 * on. Presentation only — it owns no support state and calls no service.
 *
 * The floating controls are deliberately sparse: whatever the screen passes in
 * `actions`, then the sound preference, then close. Anything else belongs in
 * the screen itself.
 */

const SOUND_KEY = 'support:sound';

function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Round, low-contrast icon button for the controls floating over the stage. */
export function ShellButton({ label, icon: Icon, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-white/65 transition-colors',
        'hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60',
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}

/**
 * The assistant's mark: its own picture when the product has set one, otherwise
 * the product logo, falling back exactly as ProductLogo does elsewhere.
 */
export function AssistantAvatar({ product, size = 'lg', online = true, className, theme }) {
  const t = theme || resolveSupportTheme(product);
  const large = size === 'lg';
  const [broken, setBroken] = useState(false);

  React.useEffect(() => setBroken(false), [t.assistantAvatar]);

  const dims = large ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-12 w-12';
  const ring = 'relative rounded-full ring-1 ring-white/15 shadow-[0_0_40px_rgba(120,190,255,0.3)]';

  return (
    <div className={cn('relative shrink-0', className)}>
      <span
        aria-hidden="true"
        className={cn('absolute rounded-full bg-cyan-300/10 blur-2xl', large ? '-inset-6' : '-inset-3')}
      />

      {t.assistantAvatar && !broken ? (
        <img
          src={t.assistantAvatar}
          alt=""
          onError={() => setBroken(true)}
          className={cn(ring, dims, 'object-cover')}
        />
      ) : (
        <ProductLogo product={product} rounded="rounded-full" className={cn(ring, dims)} />
      )}

      {online && t.showOnlineDot && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute rounded-full border-2 bg-emerald-400',
            large ? 'bottom-1 right-1 h-4 w-4' : 'bottom-0 right-0 h-3 w-3'
          )}
          style={{ borderColor: t.bgMid }}
        />
      )}
    </div>
  );
}

export default function ImmersiveShell({ product, theme, framed, actions = [], onClose, children, className }) {
  // A stored preference rather than throwaway state, so muting survives a move
  // between the welcome screen and the conversation.
  const [sound, setSound] = useState(readSound);

  const t = theme || resolveSupportTheme(product);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off');
    } catch {
      /* private mode — the toggle still works for this page */
    }
  }, [sound]);

  return (
    <div
      style={supportThemeVars(t)}
      className={cn('support-stage relative flex min-h-0 flex-1 flex-col overflow-hidden text-white', className)}
    >
      {framed && <span aria-hidden="true" className="support-frame pointer-events-none absolute inset-0 z-20" />}

      <div className="absolute right-3 top-3 z-30 flex items-center gap-0.5 sm:right-5 sm:top-4">
        {actions.map((a) => (
          <ShellButton key={a.label} label={a.label} icon={a.icon} onClick={a.onClick} />
        ))}
        {t.showSound && (
          <ShellButton
            label={sound ? 'Mute sounds' : 'Unmute sounds'}
            icon={sound ? Volume2 : VolumeX}
            onClick={() => setSound((s) => !s)}
          />
        )}
        {onClose && t.showClose && <ShellButton label="Close support" icon={X} onClick={onClose} />}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
