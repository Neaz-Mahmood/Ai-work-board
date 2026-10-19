import React, { useState } from "react";
import { useLogin } from "../api/auth.ts";
import { ApiFailure } from "../api/client.ts";
import "./LoginPage.css";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({ password });
    } catch (err: unknown) {
      if (err instanceof ApiFailure) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to sign in");
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Sign in to AI Work Board</h1>
        </div>
        <form className="login-form dialog-form" onSubmit={handleSubmit}>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="login-password-input">
              Password
            </label>
            <input
              id="login-password-input"
              type="password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="login-actions dialog-actions">
            <button
              type="submit"
              className="button button-primary"
              data-testid="login-submit"
              disabled={login.isPending}
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
