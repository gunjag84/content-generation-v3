import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { useUserDoc } from './useUserDoc';
import { SignInScreen } from './SignInScreen';
import { OnboardingModal } from './OnboardingModal';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser, setLoading } = useAuthStore();
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [setUser, setLoading]);

  const { data: userDoc, loading: docLoading } = useUserDoc(user?.uid ?? null);

  if (loading) return <div className="p-8 text-center text-zinc-400 bg-zinc-950 min-h-screen">Lade…</div>;
  if (!user) return <SignInScreen />;
  if (docLoading) return <div className="p-8 text-center text-zinc-400 bg-zinc-950 min-h-screen">Lade Profil…</div>;

  const onboardingComplete = !!userDoc?.activeBrandId && !!userDoc?.apiKeys?.anthropic;
  if (!onboardingComplete) {
    return (
      <OnboardingModal
        uid={user.uid}
        userEmail={user.email ?? ''}
        userDisplayName={user.displayName}
        existingActiveBrandId={userDoc?.activeBrandId}
      />
    );
  }
  return <>{children}</>;
}
