import { createContext, useContext } from "react";

interface AuthContextValue {
  openSignIn: () => void;
}

export const AuthContext = createContext<AuthContextValue>({ openSignIn: () => {} });

export function useAuthContext() {
  return useContext(AuthContext);
}
