import { useState } from 'react';
import { signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

const EMAIL_LINK_KEY = 'cg-emailForSignIn';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user landed via email link, complete sign-in
  if (typeof window !== 'undefined' && isSignInWithEmailLink(auth, window.location.href)) {
    const stored = window.localStorage.getItem(EMAIL_LINK_KEY);
    if (stored) {
      signInWithEmailLink(auth, stored, window.location.href)
        .then(() => window.localStorage.removeItem(EMAIL_LINK_KEY))
        .catch((e) => setError(e.message));
    }
  }

  async function handleGoogle() {
    setError(null);
    try { await signInWithPopup(auth, googleProvider); } catch (e: any) { setError(e.message); }
  }

  async function handleEmailLink(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin + '/',
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_LINK_KEY, email);
      setLinkSent(true);
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Anmelden</h1>
        <button onClick={handleGoogle} className="w-full border border-zinc-700 rounded px-4 py-2 text-zinc-100 hover:bg-zinc-800">
          Mit Google anmelden
        </button>
        <div className="text-center text-sm text-zinc-400">oder</div>
        <form onSubmit={handleEmailLink} className="space-y-3">
          <label className="block text-sm text-zinc-300">E-Mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-zinc-700 rounded px-3 py-2 bg-zinc-800 text-zinc-100" />
          </label>
          <button type="submit" className="w-full bg-black text-white rounded px-4 py-2">
            Magic Link senden
          </button>
        </form>
        {linkSent && <p className="text-sm text-green-400">Link gesendet. Prüfe dein Postfach.</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
