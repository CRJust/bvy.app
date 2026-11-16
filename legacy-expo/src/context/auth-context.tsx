import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1. Obține sesiunea curentă salvată în AsyncStorage
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession }, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn('Beavy Auth: eroare la obținerea sesiunii:', error.message);
        }
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // 2. Ascultă schimbările de sesiune (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        return { error: 'Te rugăm să introduci adresa de email și parola.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Email sau parolă incorectă. Te rugăm să încerci din nou.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return {
            error:
              'Adresa de email nu a fost confirmată încă. Verifică linkul primit pe mail.',
          };
        }
        return { error: error.message };
      }

      setSession(data.session);
      setUser(data.user);
      return {};
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<{ error?: string; needsConfirmation?: boolean }> => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();

      if (!cleanEmail) {
        return { error: 'Adresa de email este obligatorie.' };
      }
      if (password.length < 6) {
        return { error: 'Parola trebuie să aibă cel puțin 6 caractere.' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName || 'Utilizator Beavy',
          },
        },
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          return { error: 'Există deja un cont cu această adresă de email.' };
        }
        return { error: error.message };
      }

      // Dacă Supabase cere confirmarea pe email, `session` va fi inițial null
      const needsConfirmation = !data.session;
      if (data.session) {
        setSession(data.session);
        setUser(data.user);
      }

      return { needsConfirmation };
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Eroare la delogare:', err);
    } finally {
      setSession(null);
      setUser(null);
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<{ error?: string }> => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return { error: 'Te rugăm să introduci adresa de email.' };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) {
        return { error: error.message };
      }
      return {};
    },
    []
  );

  const updatePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<{ error?: string }> => {
      if (newPassword.length < 8) {
        return { error: 'Noua parolă trebuie să aibă cel puțin 8 caractere.' };
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      });
      if (error) {
        return { error: error.message };
      }
      return {};
    },
    []
  );

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [user, session, loading, signIn, signUp, signOut, resetPassword, updatePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
