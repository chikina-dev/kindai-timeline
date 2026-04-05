"use client";

import { useEffect, useState } from "react";
import { getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function LoginPageClient() {
  const router = useRouter();
  const [showAccessDenied, setShowAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function redirectIfAuthenticated() {
      const error = new URLSearchParams(window.location.search).get("error");
      setShowAccessDenied(error === "AccessDenied");

      const session = await getSession();

      if (!cancelled && session) {
        router.replace("/");
      }
    }

    void redirectIfAuthenticated();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!showAccessDenied) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        近畿大学のアカウント（@kindai.ac.jp）でログインしてください。
      </AlertDescription>
    </Alert>
  );
}