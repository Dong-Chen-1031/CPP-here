import { PUBLIC_LOCAL_COMPILER } from "astro:env/client";
import { atom, getDefaultStore, useAtomValue, type Getter } from "jotai";
import { useEffect, useState } from "react";
import i18next from "i18next";
import { compilerModeStore, type CompilerMode } from "@/store/configStore";
import {
    alertDialogStore,
    serverUnavailableStore,
    verifyJwtStore,
} from "@/store/atom";
import { addAlert } from "@/lib/alert";
import { serverBuild } from "./serverBuild";
import {
    DOWNLOADED,
    NOT_DOWNLOADED,
    browserBuild,
    browserCompilerProgressStore,
    browserCompilerSupported,
    cancelBrowserBuild,
    downloadBrowserCompiler,
    isBrowserCompilerDownloaded,
} from "./browserBuild";

export type BuildTarget = "browser" | "server";

export interface BuildResult {
    ok: boolean;
    js_code: string;
    wasm_url: string;
    errors: string[];
    wasmModule?: WebAssembly.Module;
    /**
     * The compiler could not be used at all (network, download, outage), as
     * opposed to rejecting the code, so the other one may still work.
     */
    unavailable?: boolean;
    /** In-browser builds: compile time without the download. */
    durationMs?: number;
    /** In-browser builds: whether a precompiled bits/stdc++.h was used. */
    usedPch?: boolean;
    /** The user stopped the build. */
    cancelled?: boolean;
    /** The compiler that produced this result. */
    target?: BuildTarget;
}

/** The compiler the current build uses; null while not building. */
export const buildingWithStore = atom<{
    target: BuildTarget;
    downloading: boolean;
    /** Set when `target` stands in for this compiler, which could not be used. */
    fallbackFrom?: BuildTarget;
} | null>(null);

const store = getDefaultStore();
const get: Getter = (anAtom) => store.get(anAtom);

// Let the page finish loading before a background download competes with it.
const BACKGROUND_DOWNLOAD_DELAY_MS = 10_000;
// An in-browser compile slower than this suggests the server instead.
const SLOW_BUILD_MS = 7_000;

export function browserCompilerAvailable() {
    return PUBLIC_LOCAL_COMPILER && browserCompilerSupported();
}

/** Without the in-browser compiler only the server is left. */
export function effectiveCompilerMode(getter: Getter = get): CompilerMode {
    return browserCompilerAvailable() ? getter(compilerModeStore) : "server";
}

interface NavigatorHints {
    deviceMemory?: number;
    connection?: {
        saveData?: boolean;
        type?: string;
        effectiveType?: string;
        downlink?: number;
    };
}

/** Clang in WebAssembly needs a few cores and some memory to be usable. */
function deviceCanCompile() {
    if (typeof navigator === "undefined") return false;
    const { deviceMemory } = navigator as Navigator & NavigatorHints;
    return (
        (navigator.hardwareConcurrency ?? 0) >= 4 &&
        (deviceMemory === undefined || deviceMemory >= 4)
    );
}

/** About 26 MB: only on a capable device with a fast, unmetered connection. */
function canDownloadInBackground() {
    if (!deviceCanCompile()) return false;
    const { connection } = navigator as Navigator & NavigatorHints;
    if (connection)
        return (
            !connection.saveData &&
            connection.type !== "cellular" &&
            (connection.effectiveType ?? "4g") === "4g" &&
            (connection.downlink ?? Infinity) >= 5
        );
    // Safari and Firefox tell nothing about the connection: skip phones and
    // tablets, which may be on mobile data.
    return !matchMedia("(pointer: coarse)").matches;
}

function chooseTarget(getter: Getter): BuildTarget {
    const mode = effectiveCompilerMode(getter);
    if (mode !== "auto") return mode;
    if (getter(serverUnavailableStore)) return "browser";
    return getter(browserCompilerProgressStore) === DOWNLOADED &&
        deviceCanCompile()
        ? "browser"
        : "server";
}

/**
 * The next build goes to the server, which needs a verified token. Not once
 * the server is known to be unavailable: the build then fails at once with a
 * way out instead of the button waiting for a token that may never come.
 */
export const buildNeedsVerificationStore = atom(
    (getter) =>
        chooseTarget(getter) === "server" && !getter(serverUnavailableStore),
);

/**
 * Whether the next build needs a verified token. True until hydrated: the
 * server cannot see the setting or the device, and React keeps a mismatched
 * attribute such as `disabled` from the server HTML.
 */
export function useBuildNeedsVerification() {
    const needsVerification = useAtomValue(buildNeedsVerificationStore);
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => setHydrated(true), []);
    return !hydrated || needsVerification;
}

// One failed background download is reported; retrying after every build
// would repeat the same message.
let backgroundDownloadFailed = false;

function downloadInBackground() {
    if (
        backgroundDownloadFailed ||
        effectiveCompilerMode() !== "auto" ||
        store.get(browserCompilerProgressStore) !== NOT_DOWNLOADED ||
        !canDownloadInBackground()
    )
        return;
    void downloadBrowserCompiler("background").then((downloaded) => {
        if (downloaded) return;
        backgroundDownloadFailed = true;
        addAlert({
            title: i18next.t("editor:compiler.backgroundDownloadFailedTitle"),
            description: i18next.t(
                "editor:compiler.backgroundDownloadFailedDescription",
            ),
        });
    });
}

/** Downloads the in-browser compiler now, telling the user if that fails. */
export async function startBrowserCompilerDownload() {
    if (await downloadBrowserCompiler("settings")) return;
    addAlert({
        title: i18next.t("editor:compiler.downloadFailedTitle"),
        description: i18next.t("editor:compiler.downloadFailed"),
        variant: "destructive",
    });
}

let prepared = false;
/**
 * Reads whether the in-browser compiler is downloaded and, in auto mode on a
 * capable device, downloads it in the background once the page has settled.
 */
export function prepareBuild() {
    if (prepared || !browserCompilerAvailable()) return;
    prepared = true;
    void isBrowserCompilerDownloaded().then((downloaded) => {
        if (!downloaded)
            setTimeout(downloadInBackground, BACKGROUND_DOWNLOAD_DELAY_MS);
    });
}

// Set while a build waits for a foreground download; switching to auto mode
// lets that build go elsewhere instead of waiting.
let leaveDownload: (() => void) | undefined;

function suggestAutoWhileDownloading() {
    addAlert({
        title: i18next.t("editor:compiler.downloadingTitle"),
        description: i18next.t("editor:compiler.downloadingDescription"),
        action: {
            text: i18next.t("editor:compiler.switchToAuto"),
            onClick: () => {
                store.set(compilerModeStore, "auto");
                leaveDownload?.();
            },
        },
        duration: 10_000,
    });
}

/**
 * Resolves to null when the user left the download for auto mode or stopped
 * the build (`stop` resolves).
 */
async function buildInBrowser(
    code: string,
    cppVersion: string,
    stop: Promise<null>,
    offerAuto: boolean,
    fallbackFrom?: BuildTarget,
): Promise<BuildResult | null> {
    const downloading = !(await isBrowserCompilerDownloaded());
    store.set(buildingWithStore, {
        target: "browser",
        downloading,
        fallbackFrom,
    });
    if (downloading) {
        if (offerAuto) suggestAutoWhileDownloading();
        const left = new Promise<null>((resolve) => {
            leaveDownload = () => resolve(null);
        });
        // Stopping leaves the download running: the next build can use it.
        const downloaded = await Promise.race([
            downloadBrowserCompiler("build"),
            left,
            stop,
        ]);
        leaveDownload = undefined;
        if (downloaded === null) return null;
        if (!downloaded)
            return {
                ok: false,
                js_code: "",
                wasm_url: "",
                errors: [i18next.t("editor:compiler.downloadFailed")],
                unavailable: true,
            };
        store.set(buildingWithStore, {
            target: "browser",
            downloading: false,
            fallbackFrom,
        });
    }
    return Promise.race([browserBuild(code, cppVersion), stop]);
}

async function buildWith(
    target: BuildTarget,
    code: string,
    cppVersion: string,
    stop: Promise<null>,
    offerAuto: boolean,
    fallbackFrom?: BuildTarget,
): Promise<BuildResult | null> {
    let result: BuildResult | null;
    if (target === "server") {
        store.set(buildingWithStore, {
            target,
            downloading: false,
            fallbackFrom,
        });
        result =
            !store.get(verifyJwtStore) && store.get(serverUnavailableStore)
                ? {
                      ok: false,
                      js_code: "",
                      wasm_url: "",
                      errors: [i18next.t("editor:compiler.serverUnreachable")],
                      unavailable: true,
                  }
                : // The request cannot be withdrawn; its answer is ignored.
                  await Promise.race([serverBuild(code, cppVersion), stop]);
    } else {
        result = await buildInBrowser(
            code,
            cppVersion,
            stop,
            offerAuto,
            fallbackFrom,
        );
    }
    return result && { ...result, target };
}

/**
 * Builds with the compiler the setting picks. Auto mode prefers a downloaded
 * in-browser compiler on a capable device, otherwise the server, and falls
 * back to the other one when the first cannot be used. `target` forces one
 * compiler for this build only.
 */
export async function build(
    code: string,
    cppVersion: string,
    target?: BuildTarget,
): Promise<BuildResult> {
    let chosen = target;
    let stopped = false;
    let resolveStop!: (value: null) => void;
    const stop = new Promise<null>((resolve) => (resolveStop = resolve));
    const cancel = () => {
        stopped = true;
        cancelBrowserBuild();
        resolveStop(null);
    };
    cancelCurrent = cancel;
    const cancelled = (): BuildResult => ({
        ok: false,
        js_code: "",
        wasm_url: "",
        errors: [],
        cancelled: true,
        target: chosen,
    });
    try {
        if (browserCompilerAvailable()) await isBrowserCompilerDownloaded();
        for (;;) {
            if (stopped) return cancelled();
            chosen = target ?? chooseTarget(get);
            const offerAuto = !target && effectiveCompilerMode() === "browser";
            let result = await buildWith(
                chosen,
                code,
                cppVersion,
                stop,
                offerAuto,
            );
            if (stopped || result?.cancelled) return cancelled();
            // Left the download: now in auto mode, choose again.
            if (!result) continue;
            if (
                result.unavailable &&
                !target &&
                effectiveCompilerMode() === "auto"
            ) {
                if (chosen === "server")
                    store.set(serverUnavailableStore, true);
                const other = chosen === "server" ? "browser" : "server";
                if (other === "browser" || !store.get(serverUnavailableStore)) {
                    const failed = chosen;
                    chosen = other;
                    const fallback = await buildWith(
                        other,
                        code,
                        cppVersion,
                        stop,
                        false,
                        failed,
                    );
                    if (stopped || fallback?.cancelled) return cancelled();
                    result = fallback ?? result;
                }
            }
            if (result.target === "server" && !result.unavailable)
                downloadInBackground();
            if ((result.durationMs ?? 0) > SLOW_BUILD_MS)
                suggestServerForSpeed();
            return result;
        }
    } catch (error) {
        // Callers show a failed result; a rejection would go unnoticed.
        console.error("Build failed unexpectedly:", error);
        return {
            ok: false,
            js_code: "",
            wasm_url: "",
            errors: [String(error)],
            unavailable: true,
            target: chosen,
        };
    } finally {
        if (cancelCurrent === cancel) cancelCurrent = undefined;
        store.set(buildingWithStore, null);
    }
}

let cancelCurrent: (() => void) | undefined;

/** Stops the build in progress; it resolves as cancelled. */
export function cancelBuild() {
    cancelCurrent?.();
}

let slowBuildReported = false;

function suggestServerForSpeed() {
    if (slowBuildReported) return;
    slowBuildReported = true;
    addAlert({
        title: i18next.t("editor:compiler.slowTitle"),
        description: i18next.t("editor:compiler.slowDescription"),
        action: {
            text: i18next.t("editor:compiler.use.server"),
            onClick: () => store.set(compilerModeStore, "server"),
        },
        duration: 15_000,
    });
}

/**
 * After a failed build, points to the compiler that may work. `retry` reruns
 * the build, on `target` only when given.
 */
export function suggestOtherCompiler(
    result: BuildResult,
    retry: (target?: BuildTarget) => void,
) {
    if (!browserCompilerAvailable() || !result.target) return;
    const t = i18next.t;
    if (!result.unavailable) {
        // The in-browser compiler lacks C++ exceptions, which the server has.
        if (result.target === "browser")
            addAlert({
                title: t("editor:compiler.clangFailedTitle"),
                description: t("editor:compiler.clangFailedDescription"),
                action: {
                    text: t("editor:compiler.retryOnServer"),
                    onClick: () => retry("server"),
                },
                duration: 10_000,
            });
        return;
    }
    const use = (mode: CompilerMode) => () => {
        store.set(compilerModeStore, mode);
        retry();
    };
    // Auto mode has already tried both.
    if (effectiveCompilerMode() === "auto") return;
    const other: BuildTarget =
        result.target === "browser" ? "server" : "browser";
    store.set(alertDialogStore, {
        title: t(`editor:compiler.${result.target}UnavailableTitle`),
        description: t(
            `editor:compiler.${result.target}UnavailableDescription`,
        ),
        actions: [
            { text: t(`editor:compiler.use.${other}`), onClick: use(other) },
            {
                text: t("editor:compiler.use.auto"),
                onClick: use("auto"),
                autoFocus: true,
            },
        ],
    });
}
