import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, UserPlus, Mail, ArrowLeft } from 'lucide-react';
import { registerDriver, verifyDriverRegistration, resendDriverOtp } from '../../services/driverService.js';

const initialValues = {
  driverName: '',
  phone: '',
  email: '',
  licenseNumber: '',
  password: '',
  confirmPassword: '',
};

function DriverRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState('form');
  const [values, setValues] = useState(initialValues);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [timeLeft, setTimeLeft] = useState(300);
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isTimerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsTimerActive(false);
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerActive, timeLeft]);

  const startTimer = () => {
    setTimeLeft(300);
    setIsTimerActive(true);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const updateValue = (key, value) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validate = () => {
    if (
      !values.driverName.trim() ||
      !values.phone.trim() ||
      !values.email.trim() ||
      !values.licenseNumber.trim()
    ) {
      return 'Driver name, phone, email, and license number are required.';
    }

    if (values.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }

    if (values.password !== values.confirmPassword) {
      return 'Passwords do not match.';
    }

    return '';
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await registerDriver({
        driver_name: values.driverName,
        phone: values.phone,
        email: values.email,
        license_number: values.licenseNumber,
        password: values.password
      });
      setSuccess(`Verification code sent to ${values.email}`);
      setStep('otp');
      startTimer();
      setTimeout(() => setSuccess(''), 3000);
    } catch (registerError) {
      setError(registerError.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      await verifyDriverRegistration({ email: values.email, otp });
      setSuccess('Account created successfully. Redirecting to login...');
      window.setTimeout(() => navigate('/driver/login'), 1500);
    } catch (verifyError) {
      setError(verifyError.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await resendDriverOtp({ email: values.email });
      setSuccess(`Verification code resent to ${values.email}`);
      startTimer();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-lg items-center px-4 py-8">
      <div className="surface-panel w-full p-5 sm:p-6">
        {step === 'form' ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
              <UserPlus className="h-6 w-6" aria-hidden="true" />
            </div>

            <h2 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">
              Create Driver Account
            </h2>

            <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
              Register as a driver to receive assigned buses and routes.
            </p>

            <form onSubmit={handleRegisterSubmit} className="mt-6 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Driver Name
                </span>
                <input
                  value={values.driverName}
                  onChange={(event) => updateValue('driverName', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="name"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Phone
                </span>
                <input
                  value={values.phone}
                  onChange={(event) => updateValue('phone', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="tel"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Email
                </span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(event) => updateValue('email', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  License Number
                </span>
                <input
                  value={values.licenseNumber}
                  onChange={(event) => updateValue('licenseNumber', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Password
                </span>
                <input
                  type="password"
                  value={values.password}
                  onChange={(event) => updateValue('password', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="new-password"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Confirm Password
                </span>
                <input
                  type="password"
                  value={values.confirmPassword}
                  onChange={(event) => updateValue('confirmPassword', event.target.value)}
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="new-password"
                />
              </label>

              {error ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                  {success}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                Create Account
              </button>
            </form>

            <p className="mt-5 text-sm text-ink-600 dark:text-ink-300">
              Already registered?{' '}
              <Link
                to="/driver/login"
                className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-200"
              >
                Login
              </Link>
            </p>
          </>
        ) : (
          <>
            <button 
              onClick={() => {
                setStep('form');
                setError('');
                setSuccess('');
              }}
              className="mb-4 flex items-center text-sm font-medium text-ink-600 hover:text-brand-700 dark:text-ink-300 dark:hover:text-brand-200"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to registration
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
              <Mail className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">
              Verify your email
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
              Enter the 6-digit code sent to <span className="font-semibold">{values.email}</span>
            </p>

            <form onSubmit={handleVerifySubmit} className="mt-6 grid gap-4">
              <label className="block">
                <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
                  Verification Code
                </span>
                <input
                  type="text"
                  maxLength="6"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-center text-lg tracking-[0.5em] font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
                  autoComplete="one-time-code"
                />
              </label>

              {error ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                  {success}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Verify & Complete Registration
              </button>
            </form>

            <div className="mt-6 text-center text-sm">
              <p className="text-ink-600 dark:text-ink-300">
                Didn't receive the code?{' '}
                {timeLeft > 0 ? (
                  <span className="font-medium text-ink-500">
                    Resend in {formatTime(timeLeft)}
                  </span>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="font-semibold text-brand-700 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-200"
                  >
                    Resend Code
                  </button>
                )}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default DriverRegister;