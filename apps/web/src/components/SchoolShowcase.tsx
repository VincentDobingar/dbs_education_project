import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { listShowcaseSchools, type ShowcaseSchool } from "../lib/publicApi.js";

const AUTOPLAY_MS = 5000;

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 || /^\p{Lu}/u.test(word));
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || name.slice(0, 2).toUpperCase()
  );
}

function SchoolLogo({ school }: { school: ShowcaseSchool }): ReactNode {
  const [failed, setFailed] = useState(false);
  if (school.logoUrl && !failed) {
    return (
      <img
        src={school.logoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-16 w-16 rounded-xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-slate-200"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-brand-night to-slate-700 text-lg font-bold tracking-wide text-brand-gold shadow-sm"
    >
      {initials(school.name)}
    </span>
  );
}

function SchoolCard({ school }: { school: ShowcaseSchool }): ReactNode {
  const { t, i18n } = useTranslation("marketing");
  const country = i18n.language.startsWith("en") ? school.countryNameEn : school.countryNameFr;
  const place = [school.city, country].filter(Boolean).join(", ");
  const description =
    school.publicDescription ??
    t(school.ownershipType === "PUBLIC" ? "home.trust.fallbackPublic" : "home.trust.fallbackPrivate");

  return (
    <li
      className="group relative flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-teal/40 hover:shadow-xl sm:w-[320px]"
      aria-roledescription={t("home.trust.slide")}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-brand-teal via-brand-gold to-brand-teal opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex items-center gap-4">
        <SchoolLogo school={school} />
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold leading-snug text-slate-900">{school.name}</h3>
          {place ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-teal" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-slate-600">{description}</p>
    </li>
  );
}

/**
 * « Ils nous font confiance » : établissements validés qui ont accepté d'apparaître
 * sur la page d'accueil. Défilement automatique (suspendu au survol, au focus et si
 * l'utilisateur préfère réduire les animations), flèches et glissement au doigt.
 * Rien n'est affiché tant qu'aucun établissement n'est disponible.
 */
export function SchoolShowcase(): ReactNode {
  const { t } = useTranslation("marketing");
  const schools = useQuery({
    queryKey: ["showcase-schools"],
    queryFn: listShowcaseSchools,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const trackRef = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setEdges({
      start: track.scrollLeft <= 4,
      end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4,
    });
  }, []);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("li");
    const step = (card?.getBoundingClientRect().width ?? 300) + 24;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  const count = schools.data?.length ?? 0;

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [count, updateEdges]);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (paused || reduceMotion || count < 2) return;
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || document.hidden || track.scrollWidth <= track.clientWidth) return;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) {
        track.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scrollByCard(1);
      }
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [paused, count, scrollByCard]);

  if (!schools.data || count === 0) {
    return null;
  }

  const overflowing = !(edges.start && edges.end);

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50"
      aria-labelledby="trust-title"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[48rem] -translate-x-1/2 rounded-full bg-brand-teal/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-gold">
              {t("home.trust.eyebrow", { count })}
            </p>
            <h2 id="trust-title" className="mt-2 text-3xl font-bold text-slate-900">
              {t("home.trust.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">{t("home.trust.subtitle")}</p>
          </div>
          {overflowing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                disabled={edges.start}
                aria-label={t("home.trust.previous")}
                className="rounded-full border border-slate-300 bg-white p-2 text-slate-700 shadow-sm transition hover:border-brand-teal hover:text-brand-teal disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                disabled={edges.end}
                aria-label={t("home.trust.next")}
                className="rounded-full border border-slate-300 bg-white p-2 text-slate-700 shadow-sm transition hover:border-brand-teal hover:text-brand-teal disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        <div
          className="relative mt-8"
          role="region"
          aria-roledescription={t("home.trust.carousel")}
          aria-label={t("home.trust.title")}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
        >
          {!edges.start ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-slate-50 to-transparent"
            />
          ) : null}
          {!edges.end ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-slate-50 to-transparent"
            />
          ) : null}
          <ul
            ref={trackRef}
            onScroll={updateEdges}
            className={`flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              overflowing ? "" : "justify-center"
            }`}
          >
            {schools.data.map((school) => (
              <SchoolCard key={school.id} school={school} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
