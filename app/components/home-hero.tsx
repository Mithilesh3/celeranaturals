"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";

const slides = [
  {
    src: "/assets/images/hero/Complete%20Nutrition%20for%20a%20Healthier%20Tomorrow(1).png",
    alt: "Complete Nutrition for a Healthier Tomorrow by Celera Naturals",
    width: 1983,
    height: 793,
    shopCta: null,
  },
  {
    src: "/assets/images/hero/Celera%20Natural%20Fiber%20Wellness%20Banner(1).png",
    alt: "Celera Natural Fiber Wellness banner",
    width: 1983,
    height: 793,
    shopCta: {
      href: "/product/celera-naturals-isabgol-psyllium-husk-2x100g",
      label: "Shop the Celera Natural Fiber Isabgol product",
      position: "fiber",
    },
  },
  {
    src: "/assets/images/hero/Celera%20Natural%20Isabgol%20Digestive%20Wellness(1).png",
    alt: "Celera Natural Isabgol Digestive Wellness banner",
    width: 1774,
    height: 887,
    shopCta: {
      href: "/product/celera-naturals-isabgol-psyllium-husk-2x100g",
      label: "Shop Celera Naturals Isabgol Psyllium Husk",
      position: "isabgol",
    },
  },
];

const AUTO_ADVANCE_MS = 3000;
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const animationFrame = useRef<number | null>(null);
  const active = (position - 1 + slides.length) % slides.length;
  const activeSlide = slides[active];
  const controlsHeight = 34;

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
  }, [hovered, reducedMotion]);

  const change = (direction: number) => {
    setPosition((current) => {
      const next = normalizePosition(current) + direction;
      if (!reducedMotion) return next;
      return next < 1 ? slides.length : next > slides.length ? 1 : next;
    });
  };

  const goToSlide = (index: number) => {
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
    <section className="home-hero" aria-label="Celeranaturals featured banners">
      <div
        className="home-hero-slider"
        data-hero-slider
        style={{ height: `calc(${(activeSlide.height / activeSlide.width) * 100}vw + ${controlsHeight}px)` }}
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
          style={{ height: `calc(100% - ${controlsHeight}px)`, transform: `translate3d(-${position * 100}%, 0, 0)` }}
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
                <a
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
