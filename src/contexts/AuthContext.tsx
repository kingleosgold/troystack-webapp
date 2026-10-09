import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { syncSubscription } from '../services/api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithApple: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  linkWithGoogle: () => Promise<{ error: AuthError | null }>;
  linkWithApple: () => Promise<{ error: AuthError | null }>;
  updateEmailPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | null }>;
  getLinkedProviders: () => string[];
  hasEmailPassword: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Without Supabase there's no session to wait for.
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-sync subscription on login (fire-and-forget, once per user)
  useEffect(() => {
    if (!user || syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    syncSubscription(user.id).catch(() => {
      // Ignored on purpose, the sync is best effort
    });
  }, [user]);

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    // With email confirmation on, Supabase returns a user but no session yet.
    return { error, needsConfirmation: !error && !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { error };
  };

  const signInWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      // Clear app data on sign out (keep theme preference)
      localStorage.removeItem('stacktracker_holdings');
      localStorage.removeItem('stacktracker_pending_actions');
      localStorage.removeItem('advisor_usage');
      localStorage.removeItem('stg_upgrade_banner_dismissed');
      localStorage.removeItem('stg_checkout_redirect');
      localStorage.removeItem('stg_checkout_campaign');
      localStorage.removeItem('stg_auth_next');
    }
    return { error };
  };

  const linkWithGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/settings`,
      },
    });
    return { error };
  };

  const linkWithApple = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/settings`,
      },
    });
    return { error };
  };

  const updateEmailPassword = async (email: string, password: string) => {
    const updates: { email?: string; password?: string } = {};
    if (email) updates.email = email;
    if (password) updates.password = password;

    const { error } = await supabase.auth.updateUser(updates);
    return { error };
  };

  const resetPasswordForEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const getLinkedProviders = (): string[] => {
    if (!user?.identities) return [];
    return user.identities.map((identity) => identity.provider);
  };

  const hasEmailPassword = (): boolean => {
    if (!user?.identities) return false;
    return user.identities.some((identity) => identity.provider === 'email');
  };

  const value = {
    user,
    session,
    loading,
    isConfigured: isSupabaseConfigured,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signOut,
    linkWithGoogle,
    linkWithApple,
    updateEmailPassword,
    resetPasswordForEmail,
    getLinkedProviders,
    hasEmailPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
