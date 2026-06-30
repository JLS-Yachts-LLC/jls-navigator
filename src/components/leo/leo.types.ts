/**
 * Leo AI Assistant — Type Definitions
 * Polaris Platform
 */

export type LeoExpression =
  | "neutral"
  | "happy"
  | "thinking"
  | "curious"
  | "excited"
  | "concerned"
  | "laughing"
  | "proud"
  | "listening"
  | "speaking";

export type LeoBehaviorState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "happy"
  | "congratulating"
  | "confused"
  | "waiting";

/**
 * Maps a high-level AI interaction context to the expression Leo
 * should display. This is the "Emotional Engine" described in the
 * Leo spec — extend this map as new interaction types are added.
 */
export type LeoEmotionTrigger =
  | "greeting"
  | "answering"
  | "explaining"
  | "celebrating"
  | "warning"
  | "joke"
  | "encouraging"
  | "error"
  | "idle";

export const LEO_EMOTION_MAP: Record<LeoEmotionTrigger, LeoExpression> = {
  greeting: "happy",
  answering: "neutral",
  explaining: "thinking",
  celebrating: "excited",
  warning: "concerned",
  joke: "laughing",
  encouraging: "proud",
  error: "concerned",
  idle: "neutral",
};

export interface LeoMascotProps {
  /** Current behavior state — drives idle vs. active animation loops */
  state?: LeoBehaviorState;
  /** Explicit expression override. If omitted, derived from `state`. */
  expression?: LeoExpression;
  /** Height in px. Desktop spec calls for 280–350px. */
  size?: number;
  /** Disables all motion (accessibility / reduced-motion / low-power mode) */
  reduceMotion?: boolean;
  /** Fires once per idle blink cycle — useful for debugging/telemetry */
  onBlink?: () => void;
  className?: string;
}
