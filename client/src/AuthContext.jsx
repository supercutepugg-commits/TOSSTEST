import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const impersonateToken = params.get('impersonate');
    if (impersonateToken) {
      sessionStorage.setItem('impersonate_token', impersonateToken);
      params.delete('impersonate');
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
    const token = sessionStorage.getItem('impersonate_token') || localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.me().then(setUser).catch(() => { sessionStorage.removeItem('impersonate_token'); localStorage.removeItem('token'); }).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    localStorage.setItem('token', token);
    setUser(user);
    return user;
  };

  const logout = () => {
    sessionStorage.removeItem('impersonate_token');
    localStorage.removeItem('token');
    setUser(null);
  };

  const isImpersonating = sessionStorage.getItem('impersonate_token') != null;

  const isHQ = user && ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS', 'HQ_ACCOUNTING'].includes(user.role);
  const isStore = user && ['STORE_OWNER', 'STORE_STAFF'].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isHQ, isStore, isImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
