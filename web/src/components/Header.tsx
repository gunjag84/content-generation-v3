import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { BrandSwitcher } from './BrandSwitcher';

export function Header() {
  const user = useAuthStore((s) => s.user);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-700 px-6 py-3 bg-zinc-900">
      <div className="font-semibold text-zinc-100">Content Generation</div>
      <div className="flex items-center gap-4">
        <BrandSwitcher />
        <span className="text-sm text-zinc-400">{user?.email}</span>
        <button onClick={() => signOut(auth)} className="text-sm text-zinc-400 hover:underline">Abmelden</button>
      </div>
    </header>
  );
}
