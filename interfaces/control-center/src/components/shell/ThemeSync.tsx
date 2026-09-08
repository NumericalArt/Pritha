"use client";
import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, DEFAULT_THEME, normalizeTheme, readStoredTheme, THEME_CHANGED_EVENT, THEME_STORAGE_KEY } from "@/lib/theme";

function subscribe(listener:()=>void) {
  window.addEventListener(THEME_CHANGED_EVENT,listener);
  return ()=>window.removeEventListener(THEME_CHANGED_EVENT,listener);
}
const snapshot=()=>normalizeTheme(document.documentElement.dataset.theme);
export function useControlCenterTheme() {
  return useSyncExternalStore(subscribe,snapshot,()=>DEFAULT_THEME);
}
export function ThemeSync() {
  useEffect(()=>{
    applyTheme(readStoredTheme());
    const storage=(event:StorageEvent)=>{
      if(event.key === THEME_STORAGE_KEY || event.key === null)applyTheme(normalizeTheme(event.newValue));
    };
    window.addEventListener("storage",storage);
    return ()=>window.removeEventListener("storage",storage);
  },[]);
  return null;
}
