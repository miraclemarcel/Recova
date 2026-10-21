import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Check, Info, Loader2, X, type LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record'
type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-card',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-110 shadow-card',
  record: 'bg-[#e5484d] text-white hover:bg-[#dc3d43] shadow-card'
}
const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[13.5px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'lg' ? 'size-[18px]' : 'size-4'} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <Tooltip label={label}>
      <button
        {...rest}
        aria-label={label}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-40',
          active && 'bg-accent-soft text-accent',
          className
        )}
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  )
}

export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#16161d] px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-white opacity-0 shadow-pop transition-opacity delay-300 duration-150 group-hover/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
        )}
      >
        {label}
      </span>
    </span>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</div>
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40', checked ? 'bg-accent' : 'bg-surface-3 border border-line-strong')}
    >
      <span className={cn('absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  className
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md font-medium whitespace-nowrap transition disabled:opacity-35',
            size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
            o.value === value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({ value, onChange, options, disabled, className, placeholder }: { value: T | ''; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean; className?: string; placeholder?: string }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink shadow-card outline-none focus:border-accent disabled:opacity-50',
        className
      )}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-[12.5px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-medium text-ink tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-ink-3">{hint}</div>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn('h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink shadow-card outline-none placeholder:text-ink-3 focus:border-accent', props.className)}
    />
  )
}

export function Notice({ kind = 'info', children, className }: { kind?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-accent-soft text-ink-2 border-accent/20',
    warn: 'bg-warn-soft text-warn border-warn/20',
    error: 'bg-danger-soft text-danger border-danger/20',
    success: 'bg-success-soft text-success border-success/20'
  }
  const Icon = kind === 'info' ? Info : kind === 'success' ? Check : AlertTriangle
  return (
    <div className={cn('flex gap-2 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed', styles[kind], className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // Focus the first field, falling back to the first action button.
    ;(ref.current?.querySelector<HTMLElement>('input:not([type=range])') ?? ref.current?.querySelector<HTMLElement>('[role=dialog] > :last-child button'))?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" className={cn('animate-fade-in w-full rounded-2xl border border-line bg-surface shadow-pop', width)}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="px-5 pb-4 text-[13.5px] text-ink-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel, busy }: { open: boolean; title: string; message: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-ink-3', className)} />
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
        <Icon className="size-6 text-ink-3" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#16161d" stroke="var(--line-strong)" />
      <rect x="6.5" y="9" width="19" height="14" rx="3.5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.6" fill="#ff5a5f" />
    </svg>
  )
}
