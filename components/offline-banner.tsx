"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "./i18n";

export function OfflineBanner() {
  const { t } = useT();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm font-semibold text-warn lg:top-0">
      <WifiOff size={16} /> {t.common.offline}
    </div>
  );
}
