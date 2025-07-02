import { jwtDecode } from 'jwt-decode';

// Define the shape of the decoded JWT payload
interface DecodedToken {
  id: string; // This is the user ID
  iat: number;
  exp: number;
}

const AuthService = {
  /**
   * Logs in with the provided user credentials.
   * @param email - The user's email.
   * @param password - The user's password.
   */
  login: async (
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string; data?: { token: string; userId: string } }> => {
    try {
      const response = await fetch("https://api.dev.tradeved.com/user/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.data?.token) {
        throw new Error(data.message || "Login failed");
      }

      const token = data.data.token;
      const decodedToken: DecodedToken = jwtDecode(token);

      if (!decodedToken.id) {
        throw new Error("Token is invalid: Missing user ID ('id') in payload.");
      }

      // 🔐 Save to localStorage
      localStorage.setItem('gp_token', token);
      localStorage.setItem('gp_userId', decodedToken.id);

      return {
        success: true,
        message: "Login successful!",
        data: {
          token,
          userId: decodedToken.id,
        },
      };
    } catch (error: any) {
      console.error("AuthService Login Error:", error);
      AuthService.logout(); // Clean up
      return { success: false, message: error.message };
    }
  },

  /**
   * Removes user authentication data from localStorage.
   */
  logout: (): void => {
    localStorage.removeItem('gp_token');
    localStorage.removeItem('gp_userId');
  },

  /**
   * Retrieves the current user's ID if logged in.
   * @returns The user ID or null.
   */
  getCurrentUserId: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gp_userId');
  },

  /**
   * Retrieves the stored JWT token if available.
   */
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gp_token');
  },
};

export default AuthService;
