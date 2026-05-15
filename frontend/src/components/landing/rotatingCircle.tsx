import { motion } from "motion/react";
import React from "react";
import codeforcesLogo from "@/assets/logo/codeforces.svg?url";

const RADIUS = 50;
const LOGO_SIZE = 40;
const INTERVAL_MS = 1500;

export default function RotatingCircle({
    logos = [
        codeforcesLogo,
        codeforcesLogo,
        codeforcesLogo,
        codeforcesLogo,
        codeforcesLogo,
        codeforcesLogo,
    ],
    className = "",
}: {
    logos?: string[];
    className?: string;
}) {
    const count = logos.length;
    const step = 360 / count;
    const [now, setNow] = React.useState(0);
    const anchorRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const id = setInterval(() => setNow((n) => n + 1), INTERVAL_MS);
        return () => clearInterval(id);
    }, []);
    React.useEffect(() => {
        const target = document.querySelector<HTMLElement>("#target");
        if (!target || !anchorRef.current) return;

        const updateX = () => {
            const anchorRect = anchorRef.current!.getBoundingClientRect();
            const parentRect = document
                .querySelector("#extension-relative")!
                .getBoundingClientRect();
            target.style.left = `${anchorRect.left - parentRect.left + anchorRect.width / 2}px`;
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
            {logos.map((src, i) => {
                const angle = (i + now) * step;
                return (
                    <motion.div
                        key={i}
                        className="absolute inset-0"
                        animate={{ rotate: angle }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}>
                        <motion.img
                            src={src}
                            alt=""
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
                                left: `calc(50% + ${RADIUS - LOGO_SIZE / 2}px)`,
                                top: `calc(50% - ${LOGO_SIZE / 2}px)`,
                            }}
                        />
                    </motion.div>
                );
            })}
        </div>
    );
}
