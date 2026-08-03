import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bus, Lock, Phone, AlertCircle, Loader2 } from "lucide-react";
import { useDriverAuth } from "../../context/DriverAuthContext.jsx";

export default function DriverLogin() {
  const { login } = useDriverAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ phone, password });
      navigate("/driver/dashboard");
    } catch (err) {
      setError(err.message || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      {/* Background grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <Bus className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Driver Login</h1>
          <p className="mt-1 text-sm text-ink-400">
            Sign in to start your shift
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl">
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-400">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone"
                  required
                  className="w-full rounded-xl border border-white/10 bg-ink-800 py-3 pl-10 pr-4 text-sm text-white placeholder-ink-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-400">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-white/10 bg-ink-800 py-3 pl-10 pr-4 text-sm text-white placeholder-ink-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-ink-400">
            Don't have an account?{" "}
            <Link
              to="/driver/register"
              className="font-semibold text-brand-400 hover:text-brand-300"
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
