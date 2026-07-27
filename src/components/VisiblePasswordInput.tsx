import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface VisiblePasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  wrapperClassName?: string;
  toggleClassName?: string;
  iconClassName?: string;
}

const defaultToggleClassName = 'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40';

export const VisiblePasswordInput = React.forwardRef<HTMLInputElement, VisiblePasswordInputProps>(({
  className,
  disabled,
  iconClassName = 'h-4 w-4',
  id,
  toggleClassName = defaultToggleClassName,
  wrapperClassName = 'relative',
  ...props
}, ref) => {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <div className={wrapperClassName}>
      <input
        {...props}
        id={id}
        ref={ref}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        className={toggleClassName}
        aria-label={toggleLabel}
        aria-pressed={visible}
        aria-controls={id}
        title={toggleLabel}
      >
        <ToggleIcon className={iconClassName} aria-hidden="true" />
      </button>
    </div>
  );
});

VisiblePasswordInput.displayName = 'VisiblePasswordInput';
