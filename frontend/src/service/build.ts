import { PUBLIC_LOCAL_COMPILER } from "astro:env/client";
import { atom, getDefaultStore, type Getter } from "jotai";
import i18next from "i18next";
import {
    compilerFlagStore,
    compilerModeStore,
    type CompilerMode,
} from "@/store/configStore";
import {
    alertDialogStore,
    serverUnavailableStore,
    verifyJwtStore,
} from "@/store/atom";
import { addAlert } from "@/lib/alert";
import { waitForJwt } from "@/lib/axiosInstance";
import { openToolchainCache } from "@/compiler/toolchainCache";
import { serverBuild } from "./serverBuild";
import { failedBuild } from "./buildResult";
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
    /** Auto mode tried the other compiler too. */
    triedBoth?: boolean;
}

/** The compiler the current build uses; null while not building. */
export const buildingWithStore = atom<{
    target: BuildTarget;
    downloading: boolean;
    /** Waiting for Turnstile to verify before building on the server. */
    verifying?: boolean;
    /** Set when `target` stands in for this compiler, which could not be used. */
    fallbackFrom?: BuildTarget;
} | null>(null);

const store = getDefaultStore();
const get: Getter = (anAtom) => store.get(anAtom);

// Let the page finish loading before a background download competes with it.
const BACKGROUND_DOWNLOAD_DELAY_MS = 10_000;
// An in-browser compile slower than this suggests the server instead.
const SLOW_BUILD_MS = 7_000;
// How long auto mode leaves a failed server alone before trying it again.
const SERVER_RETRY_MS = 60_000;

let serverRetryTimer: ReturnType<typeof setTimeout> | undefined;

function setServerUnavailable(unavailable: boolean) {
    clearTimeout(serverRetryTimer);
    store.set(serverUnavailableStore, unavailable);
    if (!unavailable) return;
    serverRetryTimer = setTimeout(
        () => store.set(serverUnavailableStore, false),
        SERVER_RETRY_MS,
    );
}

/** The in-browser compiler has no C++ exceptions; the server has them. */
function needsExceptions(result: BuildResult) {
    return (
        result.target === "browser" &&
        !result.ok &&
        !result.unavailable &&
        result.errors.some((error) =>
            error.includes("with exceptions disabled"),
        )
    );
}

/**
 * Shipped (PUBLIC_LOCAL_COMPILER), not hidden by the compiler-menu flag, and
 * supported by this browser.
 */
export function browserCompilerAvailable(getter: Getter = get) {
    return (
        PUBLIC_LOCAL_COMPILER &&
        getter(compilerFlagStore) !== null &&
        browserCompilerSupported()
    );
}

export const browserCompilerAvailableStore = atom((getter) =>
    browserCompilerAvailable(getter),
);

/** Without the in-browser compiler only the server is left. */
export function effectiveCompilerMode(getter: Getter = get): CompilerMode {
    return browserCompilerAvailable(getter)
        ? getter(compilerModeStore)
        : "server";
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

// One failed background download is reported; retrying after every build
// would repeat the same message.
let backgroundDownloadFailed = false;

function downloadInBackground() {
    tryDownloadInBackground().catch((error) =>
        console.error("Background download failed:", error),
    );
}

async function tryDownloadInBackground() {
    const ready = () =>
        !backgroundDownloadFailed &&
        effectiveCompilerMode() === "auto" &&
        store.get(browserCompilerProgressStore) === NOT_DOWNLOADED;
    if (!ready() || !canDownloadInBackground()) return;
    // Without Cache Storage (insecure origins, some private windows) nothing
    // would be kept: every page load would download it again.
    if (!(await openToolchainCache()) || !ready()) return;
    if (await downloadBrowserCompiler("background")) return;
    backgroundDownloadFailed = true;
    addAlert({
        title: i18next.t("editor:compiler.backgroundDownloadFailedTitle"),
        description: i18next.t(
            "editor:compiler.backgroundDownloadFailedDescription",
        ),
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
            return failedBuild(i18next.t("editor:compiler.downloadFailed"));
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
        const verifying = !store.get(verifyJwtStore);
        store.set(buildingWithStore, {
            target,
            downloading: false,
            verifying,
            fallbackFrom,
        });
        // null: stopped while verifying
        const jwt = verifying ? await Promise.race([waitForJwt(), stop]) : true;
        if (jwt === null) return null;
        if (verifying)
            store.set(buildingWithStore, {
                target,
                downloading: false,
                fallbackFrom,
            });
        result = !jwt
            ? failedBuild(i18next.t("editor:run.verificationFailed"))
            : // The request cannot be withdrawn; its answer is ignored.
              await Promise.race([serverBuild(code, cppVersion), stop]);
        if (result) setServerUnavailable(!!result.unavailable);
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
                (result.unavailable || needsExceptions(result)) &&
                !target &&
                effectiveCompilerMode() === "auto"
            ) {
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
                    if (fallback?.unavailable && result.unavailable)
                        // Neither works: show why for both.
                        result = {
                            ...fallback,
                            errors: [
                                ...labelErrors(result),
                                ...labelErrors(fallback),
                            ],
                            triedBoth: true,
                        };
                    // Otherwise keep a compile error over an unusable
                    // fallback; suggestOtherCompiler then still offers it.
                    else if (fallback && !fallback.unavailable)
                        result = { ...fallback, triedBoth: true };
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
        return { ...failedBuild(String(error)), target: chosen };
    } finally {
        if (cancelCurrent === cancel) cancelCurrent = undefined;
        store.set(buildingWithStore, null);
    }
}

/** Prefixes each error with the compiler that reported it. */
function labelErrors(result: BuildResult) {
    const name = i18next.t(`editor:settings.compilerMode.${result.target}`);
    return result.errors.filter(Boolean).map((error) => `${name}: ${error}`);
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
    if (!browserCompilerAvailable() || !result.target || result.triedBoth)
        return;
    const t = i18next.t;
    if (!result.unavailable) {
        if (needsExceptions(result))
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
    if (effectiveCompilerMode() === "auto") {
        // Auto mode skipped a server that failed a moment ago; it may be back.
        if (result.target === "browser")
            addAlert({
                title: t("editor:compiler.browserUnavailableTitle"),
                description: t("editor:compiler.serverSkippedDescription"),
                action: {
                    text: t("editor:compiler.retryOnServer"),
                    onClick: () => retry("server"),
                },
                duration: 10_000,
            });
        return;
    }
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
