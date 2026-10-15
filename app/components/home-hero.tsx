"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import Link from "next/link";

/**
 * The three approved homepage banners, in the supplied order. All are
 * 1672x941, so the slider height stays steady between slides.
 *
 * The SHOP NOW artwork is baked into banners 1 and 2; `shopCta` is an
 * invisible anchor placed over that artwork so it is actually clickable. The
 * percentages were measured from the images themselves (see
 * scripts/probe-cta-position.mjs), not estimated by eye. Banner 3 carries no
 * SHOP NOW artwork, so it gets no hotspot rather than an invented one.
 */
const slides = [
  {
    src: "/assets/images/hero/Celera%20Isabgol%20Natural%20Health%20Banner(1).png",
    alt: "Naturally boost your digestive health with Celera Naturals Isabgol Powder",
    width: 1672,
    height: 941,
    shopCta: {
      href: "/product/celera-naturals-isabgol-psyllium-husk-2x100g",
      label: "Shop Celera Naturals Isabgol Psyllium Husk",
      position: "isabgol",
    },
  },
  {
    src: "/assets/images/hero/Natural%20Fiber%20Wellness%20Banner(1).png",
    alt: "Natural fiber for a happier, healthier you — Celera Naturals Isabgol Psyllium Husk",
    width: 1672,
    height: 941,
    shopCta: {
      href: "/product/celera-naturals-isabgol-psyllium-husk-2x100g",
      label: "Shop Celera Naturals Isabgol Psyllium Husk",
      position: "fiber",
    },
  },
  {
    src: "/assets/images/hero/Celera%20Healthcare%20Complete%20Nutrition%20Banner(1).png",
    alt: "Celera Healthcare complete nutrition range: CELEPRO, CelD3, C CAL-XT and C Cal-Forte",
    width: 1672,
    height: 941,
    shopCta: null,
  },
];

/**
 * Height ratio of the TALLEST banner, not the active one.
 *
 * This is the bug that crops the live site: there the container is sized from
 * whichever slide is active, but the banners have mixed shapes (1983x793 needs
 * 39.99vw, 1774x887 needs 50vw). Whenever the shorter ratio is in force the
 * taller banner is 192px too tall at 1920px wide and is clipped by the
 * slider's overflow:hidden — 96px off the top and 62px off the bottom.
 *
 * Sizing from the tallest slide means no banner can ever overflow its box.
 * A shorter banner simply centres with a little space above and below, which
 * object-fit: contain handles without cropping. It also keeps the height
 * constant, so the slider no longer resizes as slides change.
 */
const TALLEST_RATIO = Math.max(...slides.map((slide) => slide.height / slide.width));

/** Autoplay cadence requested for the new banners. */
const AUTO_ADVANCE_MS = 2000;
const normalizePosition = (current: number) => {
  if (current === 0) return slides.length;
  if (current === slides.length + 1) return 1;
  return Math.min(slides.length, Math.max(1, current));
};
const carouselSlides = [
  { ...slides[slides.length - 1], key: "clone-last" },
  ...slides.map((slide, index) => ({ ...slide, key: `slide-${index}` })),
  { ...slides[0], key: "clone-first" },
];

export function HomeHero() {
  const [position, setPosition] = useState(1);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [interactionTick, setInteractionTick] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const animationFrame = useRef<number | null>(null);
  const active = (position - 1 + slides.length) % slides.length;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => () => {
    if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
  }, []);

  // Bumped by any manual navigation. The autoplay effect depends on it, so the
  // interval is torn down and restarted — otherwise, at a 2s cadence, a slide
  // the visitor just chose could be replaced a fraction of a second later.
  useEffect(() => {
    if (hovered) return;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        const currentSlide = normalizePosition(current);
        if (reducedMotion) return currentSlide >= slides.length ? 1 : currentSlide + 1;
        return currentSlide + 1;
      });
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [hovered, reducedMotion, interactionTick]);

  const change = (direction: number) => {
    setInteractionTick((tick) => tick + 1);
    setPosition((current) => {
      const next = normalizePosition(current) + direction;
      if (!reducedMotion) return next;
      return next < 1 ? slides.length : next > slides.length ? 1 : next;
    });
  };

  const goToSlide = (index: number) => {
    setInteractionTick((tick) => tick + 1);
    if (index !== active) setPosition(index + 1);
  };

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (reducedMotion || event.target !== event.currentTarget || event.propertyName !== "transform") return;
    const resetPosition = position === 0 ? slides.length : position === slides.length + 1 ? 1 : null;
    if (resetPosition === null) return;

    setTransitionEnabled(false);
    setPosition(resetPosition);
    animationFrame.current = window.requestAnimationFrame(() => {
      animationFrame.current = window.requestAnimationFrame(() => {
        setTransitionEnabled(true);
        animationFrame.current = null;
      });
    });
  };

  const finishTouch = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;

    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      change(deltaX < 0 ? 1 : -1);
    }
  };

  return (
    <section className="home-hero" aria-label="Celera Naturals featured banners">
      <div
        className="home-hero-slider"
        data-hero-slider
        /*
         * Full-bleed width, with the height derived from the banner's own
         * ratio so the artwork is never stretched or cropped.
         *
         * There used to be a 1440px width cap here to hold the height down on
         * large screens. It worked, but it left white gutters either side of
         * the banner above 1440px, which is the more visible defect.
         *
         * There is also no longer a reserved strip under the artwork for the
         * dots — they are overlaid on the banner instead, which takes 34px
         * off the hero at every viewport. With full width and no cropping,
         * the banners' own 1.7768:1 ratio fixes the rest of the height.
         *
         * aspect-ratio, not a vw calculation: `100vw` includes the classic
         * scrollbar, so on a desktop browser with one a vw-derived height is
         * a few pixels taller than the image and leaves a white strip under
         * the banner. aspect-ratio measures this element's real width.
         */
        style={{ aspectRatio: `1 / ${TALLEST_RATIO}` }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHovered(false);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={finishTouch}
        onTouchCancel={() => { touchStart.current = null; }}
      >
        <div
          className={`home-hero-track${transitionEnabled ? "" : " instant"}`}
          style={{ transform: `translate3d(-${position * 100}%, 0, 0)` }}
          onTransitionEnd={handleTransitionEnd}
        >
          {carouselSlides.map(({ key, ...slide }, index) => (
            <article
              className={`home-hero-slide${slide.width / slide.height > 2 ? " home-hero-slide-top" : ""}${position === index ? " active" : ""}`}
              data-hero-slide
              key={key}
              aria-hidden={position !== index}
              >
                <img
                src={slide.src}
                alt={slide.alt}
                width={slide.width}
                height={slide.height}
                loading="eager"
                fetchPriority={index === 1 ? "high" : "auto"}
                decoding="async"
              />
              {slide.shopCta && (
                <Link
                  className={`home-hero-shop-link home-hero-shop-link-${slide.shopCta.position}`}
                  href={slide.shopCta.href}
                  aria-label={slide.shopCta.label}
                  tabIndex={position === index ? 0 : -1}
                />
              )}
            </article>
          ))}
        </div>
        <button className="home-hero-arrow home-hero-prev" type="button" aria-label="Show previous banner" onClick={() => change(-1)}>‹</button>
        <button className="home-hero-arrow home-hero-next" type="button" aria-label="Show next banner" onClick={() => change(1)}>›</button>
        <div className="home-hero-dots" role="group" aria-label="Choose a banner">
          {slides.map((slide, index) => (
            <button
              className={active === index ? "active" : ""}
              type="button"
              aria-label={`Show banner ${index + 1}: ${slide.alt}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => goToSlide(index)}
              key={slide.src}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
