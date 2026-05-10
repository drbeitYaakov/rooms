"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://rooms-ma9h.onrender.com";
const BACKEND_TOKEN_STORAGE_KEY = "rooms_backend_token";
const BACKEND_TOKEN_USER_KEY_STORAGE_KEY = "rooms_backend_token_user_key";

const getErrorMessage = (error: string | undefined, isMfaStep: boolean) => {
  if (!error) {
    return isMfaStep ? "קוד ה-MFA שגוי" : "פרטי ההתחברות שגויים";
  }

  if (error.startsWith("AUTH_401")) {
    return isMfaStep ? "קוד ה-MFA שגוי" : "פרטי ההתחברות שגויים";
  }

  if (error.startsWith("AUTH_423")) {
    return "החשבון נעול זמנית. נסי שוב מאוחר יותר.";
  }

  if (error.startsWith("AUTH_429")) {
    return "בוצעו יותר מדי ניסיונות התחברות. נסי שוב בעוד כמה דקות.";
  }

  if (error.startsWith("AUTH_MFA_REQUIRED")) {
    return "נדרש קוד אימות כדי להשלים את ההתחברות.";
  }

  if (error.startsWith("AUTH_INVALID_USER_PAYLOAD")) {
    return "השרת החזיר פרטי משתמש לא תקינים.";
  }

  if (error.startsWith("AUTH_REQUEST_FAILED")) {
    return "לא ניתן היה ליצור קשר עם השרת.";
  }

  return error;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [validatedUserJson, setValidatedUserJson] = useState<string | null>(null);
  const [validatedBackendToken, setValidatedBackendToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isMfaStep = Boolean(mfaToken);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    let resolvedUserJson = validatedUserJson;
    let resolvedBackendToken = validatedBackendToken;

    try {
      if (!isMfaStep) {
        const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        });

        const loginPayload = await loginResponse.json();

        if (!loginResponse.ok) {
          setErrorMessage(loginPayload?.error || "פרטי ההתחברות שגויים");
          return;
        }

        if (loginPayload?.data?.mfaRequired && loginPayload?.data?.mfaToken) {
          setMfaToken(loginPayload.data.mfaToken);
          setValidatedUserJson(null);
          setValidatedBackendToken(null);
          return;
        }

        resolvedUserJson = JSON.stringify(loginPayload?.data?.user ?? null);
        resolvedBackendToken = typeof loginPayload?.data?.token === "string" ? loginPayload.data.token : null;
        setValidatedUserJson(resolvedUserJson);
        setValidatedBackendToken(resolvedBackendToken);

        if (resolvedBackendToken && typeof window !== "undefined") {
          window.localStorage.setItem(BACKEND_TOKEN_STORAGE_KEY, resolvedBackendToken);
          window.localStorage.setItem(BACKEND_TOKEN_USER_KEY_STORAGE_KEY, `${loginPayload?.data?.user?.id ?? ""}:${loginPayload?.data?.user?.email ?? ""}`);
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        userJson: resolvedUserJson || undefined,
        backendToken: resolvedBackendToken || undefined,
        mfaCode: mfaCode || undefined,
        mfaToken: mfaToken || undefined,
        redirect: false,
      });

      if (result?.error) {
        console.error("NextAuth signIn error:", result.error);
        setErrorMessage(getErrorMessage(result.error, isMfaStep));
        return;
      }

      window.location.href = "/";
    } catch (error) {
      console.error("Login submit failed:", error);
      setErrorMessage("אירעה שגיאה");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isMfaStep ? "הזינו את קוד האימות שלכם" : "התחברות לחשבון"}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="כתובת אימייל"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isMfaStep || isLoading}
              />
            </div>
            <div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="סיסמה"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isMfaStep || isLoading}
              />
            </div>
            {isMfaStep && (
              <div>
                <input
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="קוד אימות בן 6 ספרות"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600 text-center">{errorMessage}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? "מתחבר..." : isMfaStep ? "אימות והתחברות" : "התחברות"}
            </button>
          </div>
          {isMfaStep && (
            <button
              type="button"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                setValidatedUserJson(null);
                setValidatedBackendToken(null);
                setErrorMessage("");
              }}
              disabled={isLoading}
              className="w-full text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              חזרה
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
