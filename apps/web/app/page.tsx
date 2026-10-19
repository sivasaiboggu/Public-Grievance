"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth, getRoleHomePath } from "../lib/auth";

export default function RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth?.access_token && auth?.user?.role) {
      router.replace(getRoleHomePath(auth.user.role));
    } else {
      router.replace("/sign-in");
    }
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="skeleton" style={{ width: "160px", height: "24px" }} />
    </div>
  );
}
