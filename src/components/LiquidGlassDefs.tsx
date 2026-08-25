import React from 'react';

/**
 * The SVG filters behind the liquid-glass material.
 *
 * Mounted once, at the root. Everything else is CSS: `backdrop-filter` can
 * reference an SVG filter by id, which is the only way to get real refraction
 * in a browser — blur and saturate alone cannot bend what is behind an element,
 * they can only soften it.
 *
 * `lg-lens` warps the backdrop with a low-frequency noise field, so content
 * behind the pane drifts slightly, the way it does through thick glass.
 * `lg-lens-strong` is the same field at a larger displacement for the moment a
 * control is pressed, when the glass should feel like it is being pushed into.
 *
 * Hidden from assistive technology and laid out at zero size so it never
 * affects the page.
 */
export const LiquidGlassDefs: React.FC = () => (
  <svg
    aria-hidden="true"
    focusable="false"
    style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
  >
    <defs>
      <filter id="lg-lens" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.010" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.4" result="soft" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="soft"
          scale="9"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      <filter id="lg-lens-strong" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.007 0.012" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="soft"
          scale="18"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>
);
