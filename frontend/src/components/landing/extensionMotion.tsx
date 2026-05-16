import { motion } from "motion/react";
import React from "react";
import codeforcesLogo from "@/assets/logo/codeforces.svg?url";
import atcoderLogo from "@/assets/logo/atcoder.avif?url";
import ceseLogo from "@/assets/logo/cses.avif?url";
import usacoLogo from "@/assets/logo/USACO.avif?url";
import spojLogo from "@/assets/logo/SPOJ.avif?url";
import kattisLogo from "@/assets/logo/Kattis.avif?url";
import { AnimatePresence } from "motion/react";

const RADIUS = 50;
const LOGO_SIZE = 40;
const INTERVAL_MS = 1500;

const logos = [
    { src: codeforcesLogo, alt: "Codeforces", pName: "A. Watermelon" },
    {
        src: atcoderLogo,
        alt: "AtCoder",
        style: { filter: "invert(100%)" },
        pName: "D - Grid Repainting",
    },
    {
        src: ceseLogo,
        alt: "CSES",
        pName: "Coin Combinations I",
    },
    {
        src: usacoLogo,
        alt: "USACO",
        style: { filter: "brightness(200%)" },
        pName: "Problem 3. Bessie's Dream",
    },
    {
        src: spojLogo,
        alt: "SPOJ",
        pName: "Prime Generator",
    },
    {
        src: kattisLogo,
        alt: "Kattis",
        pName: "Ants",
    },
];

export function RotatingCircle({
    className = "",
    now,
}: {
    className?: string;
    now: number;
}) {
    const count = logos.length;
    const step = 360 / count;
    const anchorRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const target = document.querySelector<HTMLElement>("#target");
        if (!target || !anchorRef.current) return;

        const updateX = () => {
            const anchorRect = anchorRef.current!.getBoundingClientRect();
            const parentRect = document
                .querySelector("#extension-relative")!
                .getBoundingClientRect();
            target.style.paddingLeft = `${anchorRect.left - parentRect.left + anchorRect.width / 2}px`;
        };

        const ro = new ResizeObserver(updateX);
        ro.observe(anchorRef.current);
        window.addEventListener("resize", updateX);
        updateX();

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", updateX);
        };
    }, []);

    const size = (RADIUS + LOGO_SIZE) * 2;

    return (
        <div
            className={`relative ${className}`}
            style={{
                width: size,
                height: size,
                translate: `-30px `,
            }}
            ref={anchorRef}>
            {logos.map((logo, i) => {
                const angle = (i + now) * step;
                return (
                    <motion.div
                        key={i}
                        className="absolute inset-0"
                        animate={{ rotate: angle }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}>
                        <motion.img
                            src={logo.src}
                            alt={logo.alt}
                            animate={{
                                rotate: -angle,
                                opacity:
                                    angle % 360 === 0
                                        ? 1
                                        : Math.abs((angle % 360) - 180) < 90
                                          ? 0
                                          : 0.5,
                            }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                            className="absolute"
                            style={{
                                width: LOGO_SIZE,
                                height: LOGO_SIZE,
                                objectFit: "contain",
                                left: `calc(50% + ${RADIUS - LOGO_SIZE / 2}px)`,
                                top: `calc(50% - ${LOGO_SIZE / 2}px)`,
                                ...logo.style,
                            }}
                        />
                    </motion.div>
                );
            })}
        </div>
    );
}

export function RotatingCircleMobile({
    className = "",
    now,
}: {
    className?: string;
    now: number;
}) {
    now -= 2;
    const count = logos.length;
    const step = 360 / count;
    const anchorRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const target = document.querySelector<HTMLElement>("#target");
        if (!target || !anchorRef.current) return;

        const updateX = () => {
            const anchorRect = anchorRef.current!.getBoundingClientRect();
            const parentRect = document
                .querySelector("#extension-relative")!
                .getBoundingClientRect();
            target.style.paddingLeft = `${anchorRect.left - parentRect.left + anchorRect.width / 2}px`;
        };

        const ro = new ResizeObserver(updateX);
        ro.observe(anchorRef.current);
        window.addEventListener("resize", updateX);
        updateX();

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", updateX);
        };
    }, []);

    const size = (RADIUS + LOGO_SIZE) * 2;

    return (
        <div
            className={`absolute -top-43 mx-auto ${className}`}
            style={{
                width: size,
                height: size,
                translate: "0px 90px",
            }}
            ref={anchorRef}>
            {logos.map((logo, i) => {
                const angle = (i + now) * step + 17;
                const angleForOpacity = angle;
                return (
                    <motion.div
                        key={i}
                        className="absolute inset-0"
                        animate={{ rotate: angle }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}>
                        <motion.img
                            src={logo.src}
                            alt={logo.alt}
                            animate={{
                                rotate: -angle,
                                opacity:
                                    angleForOpacity % 360 === 257
                                        ? 1
                                        : Math.abs(angleForOpacity % 360) < 100
                                          ? 0
                                          : 0.5,
                            }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                            className="absolute"
                            style={{
                                width: LOGO_SIZE,
                                height: LOGO_SIZE,
                                objectFit: "contain",
                                left: `calc(70% + ${RADIUS - LOGO_SIZE / 2}px)`,
                                top: `calc(60% - ${LOGO_SIZE / 2}px)`,
                                ...logo.style,
                            }}
                        />
                    </motion.div>
                );
            })}
        </div>
    );
}

export function ExtensionAlert({ now }: { now: number }) {
    return (
        <div
            role="alertdialog"
            id="radix-_r_0_"
            aria-describedby="radix-_r_2_"
            aria-labelledby="radix-_r_1_"
            data-state="open"
            data-slot="alert-dialog-content"
            data-size="default"
            className="group/alert-dialog-content z-50 grid w-full gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            tabIndex={-1}
            style={{ pointerEvents: "none" }}>
            <div
                data-slot="alert-dialog-header"
                className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]">
                <h2
                    id="radix-_r_1_"
                    data-slot="alert-dialog-title"
                    className="text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2">
                    Received Test Case from Extension
                </h2>
                <p
                    id="radix-_r_2_"
                    data-slot="alert-dialog-description"
                    className="text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground inter">
                    Test case of{" "}
                    <code>
                        <AnimatePresence mode="popLayout">
                            <motion.span
                                transition={{ duration: 0.5 }}
                                style={{ display: "inline-block" }}
                                key={logos[now % logos.length].pName}
                                initial={{
                                    opacity: 0,
                                    filter: "blur(8px)",
                                    // scale: 0.92,
                                }}
                                animate={{
                                    opacity: 1,
                                    filter: "blur(0px)",
                                    scale: 1,
                                }}
                                exit={{
                                    opacity: 0,
                                    filter: "blur(8px)",
                                    scale: 1.08,
                                }}>
                                {
                                    logos[
                                        (6 - (now % logos.length)) %
                                            logos.length
                                    ].pName
                                }
                            </motion.span>
                        </AnimatePresence>
                    </code>{" "}
                    has been received. Would you like to overwrite or insert the
                    new test cases?
                </p>
            </div>
            <div
                data-slot="alert-dialog-footer"
                className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    data-slot="alert-dialog-cancel"
                    className="cursor-pointer group/button inline-flex shrink-0 items-center justify-center rounded-md border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([className*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
                    data-variant="outline"
                    data-size="default">
                    Cancel
                </button>
                <button
                    type="button"
                    data-slot="alert-dialog-action"
                    className="cursor-pointer group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([className*='size-'])]:size-4 bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
                    data-variant="default"
                    data-size="default">
                    Overwrite
                </button>
                <button
                    type="button"
                    data-slot="alert-dialog-action"
                    className="cursor-pointer group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([className*='size-'])]:size-4 bg-primary text-primary-foreground [a]:hover:bg-primary/80 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
                    data-variant="default"
                    data-size="default">
                    Insert
                </button>
            </div>
        </div>
    );
}

export default function ExtensionMotion() {
    const startRef = React.useRef(Date.now());
    const hiddenAtRef = React.useRef<number | null>(null);
    const [now, setNow] = React.useState(0);

    React.useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                hiddenAtRef.current = Date.now();
            } else if (hiddenAtRef.current != null) {
                startRef.current += Date.now() - hiddenAtRef.current;
                hiddenAtRef.current = null;
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () =>
            document.removeEventListener("visibilitychange", handleVisibility);
    }, []);

    React.useEffect(() => {
        const id = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            setNow(Math.floor(elapsed / INTERVAL_MS));
        }, 200);
        return () => clearInterval(id);
    }, []);

    return (
        <>
            <RotatingCircleMobile className="block md:hidden" now={now} />
            <div className="flex justify-center items-center">
                <RotatingCircle className="hidden md:block" now={now} />
                <ExtensionAlert now={now} />
            </div>
        </>
    );
}
