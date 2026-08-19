import { create } from "zustand";

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  staff_id: string | null;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  setSession: (accessToken: string, refreshToken: string, user: CurrentUser) => void;
  logout: () => void;
};

const STORAGE_KEY = "firm_rms_auth";

function loadInitial(): Pick<AuthState, "accessToken" | "refreshToken" | "user"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitial(),
  setSession: (accessToken, refreshToken, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, user }));
    set({ accessToken, refreshToken, user });
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
