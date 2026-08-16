"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { UserRole } from "@prisma/client";

interface AuthUser {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: UserRole;
  lastLoginAt: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const json = await res.json();
        setUser(json.data ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    const interval = setInterval(fetchUser, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel("hk-nova-auth");

    channel.onmessage = (event) => {
      if (event.data === "role-updated") {
        fetchUser();
      }
    };

    return () => channel.close();
  }, []);

  const refresh = async () => {
    await fetchUser();
    new BroadcastChannel("hk-nova-auth").postMessage("role-updated");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refresh,
        isAdmin: user?.role === "ADMIN",
        isOperator: user?.role === "OPERATOR",
        isViewer: user?.role === "VIEWER",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}