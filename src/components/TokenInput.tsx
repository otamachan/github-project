import { useState } from "react";
import { setToken, verifyToken } from "../lib/github";

export default function TokenInput({ onAuth }: { onAuth: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      await verifyToken(trimmed);
      setToken(trimmed);
      onAuth();
    } catch {
      setError("Authentication failed. Please check your token and scopes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4"
        action="#"
        method="post"
      >
        <h1 className="text-2xl font-bold text-center">GitHub Project</h1>
        <p className="text-[var(--text-secondary)] text-sm text-center">
          Enter your GitHub Personal Access Token.
          <br />
          Classic: <code className="text-xs">project</code> +{" "}
          <code className="text-xs">read:org</code> (the latter is needed to
          list org-owned projects; add <code className="text-xs">repo</code>{" "}
          for Issue / PR details).
          <br />
          Fine-grained: <strong>Projects</strong> read &amp; write + org
          membership read.
        </p>
        <input
          type="text"
          name="username"
          value="github-pat"
          autoComplete="username"
          readOnly
          hidden
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          placeholder="ghp_xxxxxxxxxxxx"
          className="w-full px-3 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-base outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="w-full py-3 rounded-lg bg-[var(--accent)] text-white font-medium text-base active:opacity-80 disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
