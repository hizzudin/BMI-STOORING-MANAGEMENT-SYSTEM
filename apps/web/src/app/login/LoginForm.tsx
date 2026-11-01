'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/app/actions';

interface Labels {
  readonly email: string;
  readonly password: string;
  readonly submit: string;
  readonly error: string;
  readonly generic: string;
  readonly hint: string;
}

function SubmitButton({ label }: { label: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: '100%', justifyContent: 'center' }}>
      {label}
    </button>
  );
}

/**
 * The sign-in form. Posts to the `loginAction` Server Action, which calls the
 * API and stores the session in an httpOnly cookie, then redirects. The error
 * key returned by the action is mapped to the already-localised label.
 */
export function LoginForm({ labels }: { labels: Labels }): JSX.Element {
  const [state, formAction] = useFormState<LoginState, FormData>(loginAction, {});
  const errorText = state.error === 'login.error' ? labels.error : state.error ? labels.generic : null;

  return (
    <form action={formAction} noValidate>
      {errorText ? (
        <p className="form-error" role="alert">
          {errorText}
        </p>
      ) : null}

      <div className="field-group">
        <label className="field-label" htmlFor="email">
          {labels.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="password">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      <SubmitButton label={labels.submit} />
      <p className="field-help" style={{ marginTop: 'var(--space-md)' }}>
        {labels.hint}
      </p>
    </form>
  );
}
