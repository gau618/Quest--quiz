// src/lib/services/auth.service.ts
import { jwtDecode } from 'jwt-decode';

// Define the shape of the decoded JWT payload
interface DecodedToken {
  id: string; // This is the user ID we need
  iat: number;
  exp: number;
}

const AuthService = {
  /**
   * Logs in with the provided user credentials.
   * @param email - The user's email.
   * @param password - The user's password.
   */
  login: async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch("https://api.dev.tradeved.com/user/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // --- THE CORE FIX IS HERE ---
        // The hardcoded credentials are now replaced with function arguments
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

      // Store the token and the extracted user ID in localStorage
      localStorage.setItem('gp_token', token);
      localStorage.setItem('gp_userId', decodedToken.id);
      
      return { success: true, message: "Login successful!" };

    } catch (error: any) {
      console.error("AuthService Login Error:", error);
      AuthService.logout(); // Clean up on failure
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
   * Checks if a user is currently logged in.
   * @returns The user's ID if logged in, otherwise null.
   */
  getCurrentUserId: (): string | null => {
    // This function can only be called on the client side
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gp_userId');
  },
};

export default AuthService;
