"use client";

import { ReactNode } from "react";

interface ButtonLoadingContentProps {
  loading: boolean;
  loadingText: string;
  children: ReactNode;
  spinnerClassName?: string;
}

export default function ButtonLoadingContent({
  loading,
  loadingText,
  children,
  spinnerClassName = "border-white/35 border-t-white",
}: ButtonLoadingContentProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span
        aria-hidden="true"
        className={`h-4 w-4 animate-spin rounded-full border-2 ${spinnerClassName}`}
      />
      <span>{loadingText}</span>
    </span>
  );
}
