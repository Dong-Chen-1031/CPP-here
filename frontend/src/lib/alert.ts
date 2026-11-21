import { alertStore, type Alert } from "@/store/atom";
import { getDefaultStore } from "jotai";
import { randomId } from "@/lib/utils";

const defaultStore = getDefaultStore();

export const UNDO_ALERT_MS = 8000;

export function addAlert(alert: Omit<Alert, "id">) {
    defaultStore.set(alertStore, (p) => [...p, { ...alert, id: randomId() }]);
}
