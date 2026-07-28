import { alertStore, type Alert } from "@/store/atom";
import { getDefaultStore } from "jotai";

const defaultStore = getDefaultStore();

export function addAlert(alert: Omit<Alert, "id">) {
    defaultStore.set(alertStore, (p) => [
        ...p,
        { ...alert, id: crypto.randomUUID() },
    ]);
}
