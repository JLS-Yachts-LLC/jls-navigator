/**
 * <LeoMascot /> — Polaris AI Assistant Character
 *
 * Implements the behavior/animation spec for "Leo": idle breathing/blink,
 * listening, thinking, speaking, happy, congratulating, confused, and
 * waiting states, built as layered SVG parts (body, mane, ears, tail,
 * eyes, mouth) so each part can be animated independently.
 *
 * NOTE ON ASSETS: This ships a stylized placeholder SVG built to the
 * spec's color palette (warm golden tan fur / dark brown mane / amber
 * eyes / cream paws). Swap the SVG internals for the final layered vector
 * export when ready — keep the group classNames so the CSS animations
 * (leo-mascot.css) attach without change.
 *
 * Adapted for Vite/TanStack: the spec's <style jsx> block lives in the
 * sibling leo-mascot.css (imported below) instead of styled-jsx.
 */

import { useEffect, useState } from "react";
import { useLeoEmotion } from "./useLeoEmotion";
import type { LeoMascotProps, LeoExpression } from "./leo.types";
import "./leo-mascot.css";

const PALETTE = {
  furLight: "#E8B872",
  furBase: "#D9A24B",
  mane: "#5B3A24",
  maneDark: "#46291A",
  cream: "#F3E4C6",
  eye: "#A85C1E",
  eyeHighlight: "#FFF",
  nose: "#46291A",
  outline: "#3A2415",
};

export default function LeoMascot({
  state = "idle",
  expression,
  size = 320,
  reduceMotion = false,
  onBlink,
  className,
}: LeoMascotProps) {
  const { expression: derivedExpression, isBlinking } = useLeoEmotion({
    behaviorState: state,
  });

  const activeExpression: LeoExpression = expression ?? derivedExpression;

  // Tiny periodic "tell" so consumers can hook telemetry/lip-sync ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (isBlinking) onBlink?.();
  }, [isBlinking, onBlink]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const motionClass = reduceMotion ? "leo-static" : "leo-animated";

  return (
    <div
      className={`leo-root ${motionClass} leo-state-${state} leo-expr-${activeExpression} ${
        className ?? ""
      }`}
      style={{ width: size * 0.9, height: size }}
      role="img"
      aria-label={`Leo, the Polaris AI assistant — ${activeExpression}`}
      data-leo-state={state}
      data-leo-expression={activeExpression}
    >
      <svg
        viewBox="0 0 300 300"
        className={`leo-svg ${isBlinking ? "leo-blinking" : ""}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Tail */}
        <g className="leo-part leo-tail">
          <path
            d="M235 175 C 270 170, 290 150, 280 120 C 276 132, 262 142, 248 150"
            fill="none"
            stroke={PALETTE.furBase}
            strokeWidth="14"
            strokeLinecap="round"
          />
          <circle cx="280" cy="120" r="11" fill={PALETTE.maneDark} className="leo-tail-tip" />
        </g>

        {/* Back legs */}
        <rect x="190" y="210" width="18" height="55" rx="8" fill={PALETTE.furBase} />
        <rect x="215" y="212" width="18" height="53" rx="8" fill={PALETTE.furLight} />

        {/* Body */}
        <ellipse cx="170" cy="195" rx="78" ry="48" fill={PALETTE.furBase} />
        <ellipse cx="170" cy="210" rx="60" ry="22" fill={PALETTE.cream} opacity="0.6" />

        {/* Front legs */}
        <rect x="120" y="215" width="18" height="58" rx="8" fill={PALETTE.furLight} />
        <rect x="145" y="217" width="18" height="56" rx="8" fill={PALETTE.furBase} />
        <rect x="120" y="260" width="18" height="14" rx="6" fill={PALETTE.cream} />
        <rect x="145" y="262" width="18" height="13" rx="6" fill={PALETTE.cream} />

        {/* Mane */}
        <circle cx="90" cy="150" r="58" fill={PALETTE.mane} className="leo-mane" />

        {/* Head */}
        <circle cx="90" cy="150" r="42" fill={PALETTE.furLight} />

        {/* Ears */}
        <g className="leo-part leo-ear leo-ear-left">
          <circle cx="58" cy="112" r="14" fill={PALETTE.maneDark} />
          <circle cx="58" cy="112" r="7" fill={PALETTE.cream} />
        </g>
        <g className="leo-part leo-ear leo-ear-right">
          <circle cx="122" cy="112" r="14" fill={PALETTE.maneDark} />
          <circle cx="122" cy="112" r="7" fill={PALETTE.cream} />
        </g>

        {/* Eyebrows */}
        <g className="leo-part leo-eyebrows">
          <path
            d="M68 128 Q76 122 86 127"
            stroke={PALETTE.maneDark}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            className="leo-eyebrow-left"
          />
          <path
            d="M96 127 Q106 122 114 128"
            stroke={PALETTE.maneDark}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            className="leo-eyebrow-right"
          />
        </g>

        {/* Eyes */}
        <g className="leo-part leo-eyes">
          <g className="leo-eye leo-eye-left">
            <ellipse cx="76" cy="142" rx="10" ry="11" fill="white" />
            <circle cx="76" cy="143" r="6.5" fill={PALETTE.eye} />
            <circle cx="78" cy="140" r="2" fill={PALETTE.eyeHighlight} />
            <rect
              x="65"
              y="132"
              width="22"
              height="22"
              fill={PALETTE.furLight}
              className="leo-eyelid"
            />
          </g>
          <g className="leo-eye leo-eye-right">
            <ellipse cx="106" cy="142" rx="10" ry="11" fill="white" />
            <circle cx="106" cy="143" r="6.5" fill={PALETTE.eye} />
            <circle cx="108" cy="140" r="2" fill={PALETTE.eyeHighlight} />
            <rect
              x="95"
              y="132"
              width="22"
              height="22"
              fill={PALETTE.furLight}
              className="leo-eyelid"
            />
          </g>
        </g>

        {/* Nose & mouth group */}
        <g className="leo-part leo-mouth">
          <ellipse cx="91" cy="160" rx="7" ry="5" fill={PALETTE.nose} />
          <path
            d="M84 166 Q91 172 98 166"
            stroke={PALETTE.maneDark}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            className="leo-mouth-curve"
          />
          <path
            d="M75 172 Q91 184 107 172"
            stroke="none"
            fill={PALETTE.maneDark}
            className="leo-mouth-open"
          />
        </g>

        {/* Whiskers */}
        <g stroke={PALETTE.outline} strokeWidth="1.2" opacity="0.5">
          <line x1="55" y1="158" x2="30" y2="155" />
          <line x1="55" y1="165" x2="30" y2="167" />
          <line x1="127" y1="158" x2="152" y2="155" />
          <line x1="127" y1="165" x2="152" y2="167" />
        </g>
      </svg>
    </div>
  );
}
