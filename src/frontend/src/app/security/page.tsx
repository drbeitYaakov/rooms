"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "@/lib/auth-backend-bridge";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type MfaStatus = {
  mfaEnabled: boolean;
  roleRequiresMfa: boolean;
};

export default function SecurityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [otpAuthUrl, setOtpAuthUrl] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    void loadStatus();
  }, [session, status, router]);

  const loadStatus = async () => {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/mfa/status`);
    const payload = await response.json();
    setMfaStatus(payload?.data ?? null);
  };

  const resetMessages = () => {
    setMessage("");
    setError("");
  };

  const handleSetup = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/mfa/setup`, {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error || "Failed to initialize MFA setup");
        return;
      }

      setSetupSecret(payload.data.secret);
      setOtpAuthUrl(payload.data.otpAuthUrl);
      setMessage("MFA setup initialized. Add the secret to your authenticator app and verify with a code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/mfa/enable`, {
        method: "POST",
        body: JSON.stringify({ code: verificationCode }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error || "Failed to enable MFA");
        return;
      }

      setVerificationCode("");
      setCurrentPassword("");
      setMessage("MFA enabled successfully.");
      await loadStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/mfa/disable`, {
        method: "POST",
        body: JSON.stringify({
          currentPassword: disablePassword,
          code: disableCode,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error || "Failed to disable MFA");
        return;
      }

      setDisablePassword("");
      setDisableCode("");
      setSetupSecret("");
      setOtpAuthUrl("");
      setMessage("MFA disabled successfully.");
      await loadStatus();
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || !session) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h1 className="text-2xl font-semibold text-gray-900">אבטחת חשבון</h1>
          <p className="mt-2 text-sm text-gray-600">
            כאן אפשר להפעיל אימות דו-שלבי לחשבון. למנהלים ולרכזים מומלץ מאוד להשאיר MFA פעיל בכל עת.
          </p>
          {mfaStatus && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className={`rounded-full px-3 py-1 ${mfaStatus.mfaEnabled ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {mfaStatus.mfaEnabled ? "MFA פעיל" : "MFA כבוי"}
              </span>
              {mfaStatus.roleRequiresMfa && (
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-800">
                  מומלץ לתפקיד שלך
                </span>
              )}
            </div>
          )}
          {message && <p className="mt-4 text-sm text-green-700">{message}</p>}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">הפעלת MFA</h2>
          <form className="mt-4 space-y-4" onSubmit={handleSetup}>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="הסיסמה הנוכחית שלך"
              className="w-full rounded-xl border border-gray-300 px-4 py-2"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              יצירת סוד MFA
            </button>
          </form>

          {setupSecret && (
            <div className="mt-6 space-y-4 rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-700">הכניסי את הסוד הבא לאפליקציית Authenticator שלך:</p>
              <code className="block break-all rounded-lg bg-white p-3 text-sm text-gray-900 ring-1 ring-gray-200">{setupSecret}</code>
              <p className="text-xs text-gray-500">אפשר גם להשתמש בקישור `otpauth://` אם האפליקציה תומכת בכך.</p>
              <code className="block break-all rounded-lg bg-white p-3 text-xs text-gray-700 ring-1 ring-gray-200">{otpAuthUrl}</code>
              <form className="space-y-4" onSubmit={handleEnable}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="קוד אימות בן 6 ספרות"
                  className="w-full rounded-xl border border-gray-300 px-4 py-2"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  אימות והפעלה
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">כיבוי MFA</h2>
          <form className="mt-4 space-y-4" onSubmit={handleDisable}>
            <input
              type="password"
              value={disablePassword}
              onChange={(event) => setDisablePassword(event.target.value)}
              placeholder="הסיסמה הנוכחית שלך"
              className="w-full rounded-xl border border-gray-300 px-4 py-2"
              required
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value)}
              placeholder="קוד MFA נוכחי"
              className="w-full rounded-xl border border-gray-300 px-4 py-2"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              כיבוי MFA
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
