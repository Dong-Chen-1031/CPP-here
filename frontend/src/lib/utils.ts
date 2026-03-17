import { clsx, type ClassValue } from "clsx";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const handler = (e: { matches: boolean }) => setIsMobile(e.matches);

    // Set initial value inside useEffect
    setIsMobile(mql.matches);

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

export const commandKey =
  typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
    ? "⌘"
    : "Ctrl";
