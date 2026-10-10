import { atomWithStorage } from "jotai/utils";

/**
 * PostHog feature flag values, set by components/posthog.astro. Kept from the
 * last visit so they apply before PostHog loads; null until PostHog has ever
 * reported them (not configured, blocked, or a first visit).
 */
export const featureFlagsStore = atomWithStorage<Record<
    string,
    string | boolean
> | null>("featureFlags", null, undefined, { getOnInit: true });
