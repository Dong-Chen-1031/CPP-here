import { MotionConfig, type Transition } from "motion/react";
import type { ReactNode } from "react";

export const spring = {
    type: "spring",
    bounce: 0,
    duration: 0.35,
} as const satisfies Transition;

export const springTap = {
    type: "spring",
    bounce: 0.15,
    duration: 0.3,
} as const satisfies Transition;

export const fade = { duration: 0.2, ease: "easeOut" } as const;

export function ReducedMotion({ children }: { children: ReactNode }) {
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
