const TOKEN_KEY = 'tiktok_admin_token';
const USER_KEY  = 'tiktok_admin_user';

export const authService = {
  /** Store token after successful login */
  saveToken(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username || '');
  },

  /** Remove token on logout */
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /** Get raw JWT string */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /** Current admin username */
  getUsername() {
    return localStorage.getItem(USER_KEY) || 'admin';
  },

  /** True if token exists (not expired check — API handles that) */
  isAuthenticated() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return false;

    // Quick expiry check by decoding the payload (no signature needed)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },
};
