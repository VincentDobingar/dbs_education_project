import type { ReactNode } from "react";
import { isValidElement, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Markdown, { type Components } from "react-markdown";
import { Link, useLocation } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { guideSections, slugify } from "../lib/guide.js";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

const COMPONENTS: Components = {
  h2: ({ children }) => {
    const id = slugify(textOf(children));
    return (
      <h2
        id={id}
        className="mt-12 scroll-mt-24 border-b border-slate-200 pb-3 text-2xl font-semibold text-brand-night first:mt-0"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => (
    <h3
      id={slugify(textOf(children))}
      className="mt-8 scroll-mt-24 border-l-4 border-brand-gold pl-3 text-lg font-semibold text-brand-night"
    >
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-4 leading-relaxed text-slate-700">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-brand-night">{children}</strong>,
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-slate-700 marker:text-brand-gold">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-slate-700 marker:font-semibold marker:text-brand-night">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <aside className="mt-5 rounded-r-md border-l-4 border-brand-gold bg-amber-50 px-4 py-1 text-slate-700">
      {children}
    </aside>
  ),
  table: ({ children }) => (
    <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-brand-night text-white">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2.5 font-medium">{children}</th>,
  tr: ({ children }) => <tr className="border-t border-slate-200 even:bg-slate-50">{children}</tr>,
  td: ({ children }) => (
    <td className="px-4 py-2.5 align-top text-slate-700 first:font-medium first:text-brand-night">
      {children}
    </td>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-night">
      {children}
    </code>
  ),
  a: ({ href = "", children }) => {
    // Lien interne à l'application : navigation SPA, sans recharger la page.
    if (href.startsWith("/")) {
      return (
        <Link
          to={href}
          className="font-medium text-brand-night underline decoration-brand-gold underline-offset-2"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-brand-night underline decoration-brand-gold underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

interface GuideArticleProps {
  /** Contenu Markdown du guide (titres `##` = sections du sommaire). */
  source: string;
  /** Lien vers la version PDF, si elle existe. */
  pdfHref?: string;
}

/**
 * Guide rendu à partir de Markdown : sommaire collant à gauche sur grand écran,
 * replié au-dessus du texte sur mobile. Le HTML brut du Markdown est ignoré
 * (comportement par défaut de react-markdown), le contenu reste du texte.
 */
export function GuideArticle({ source, pdfHref }: GuideArticleProps): ReactNode {
  const { t, i18n } = useTranslation("app");
  const sections = useMemo(() => guideSections(source), [source]);
  const { hash } = useLocation();

  // La page est chargée à la demande : quand le navigateur traite l'ancre d'un
  // lien direct (/guide#roles-et-menus), le titre visé n'existe pas encore.
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    }
  }, [hash]);

  const toc = (
    <ol className="space-y-1 text-sm">
      {sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex gap-2 rounded px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-night"
          >
            <span className="w-5 shrink-0 font-semibold text-brand-gold">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label={t("guide.toc")} className="mb-8 lg:mb-0">
        <div className="lg:sticky lg:top-6">
          <details className="rounded-lg border border-slate-200 bg-white p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-brand-night">
              {t("guide.toc")}
            </summary>
            <div className="mt-2">{toc}</div>
          </details>
          <div className="hidden lg:block">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-brand-gold">
              {t("guide.toc")}
            </p>
            {toc}
            {pdfHref ? (
              <a
                href={pdfHref}
                download
                className="mt-6 block rounded-md bg-brand-night px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                {t("guide.downloadPdf")}
              </a>
            ) : null}
          </div>
        </div>
      </nav>

      <article className="min-w-0 rounded-xl border border-slate-200 bg-white px-5 py-8 sm:px-10">
        {i18n.language.startsWith("fr") ? null : (
          <p className="mb-6 rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-600">
            {t("guide.frenchOnly")}
          </p>
        )}
        {pdfHref ? (
          <a
            href={pdfHref}
            download
            className="mb-6 inline-block rounded-md bg-brand-night px-4 py-2 text-sm font-medium text-white lg:hidden"
          >
            {t("guide.downloadPdf")}
          </a>
        ) : null}
        <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {source}
        </Markdown>
      </article>
    </div>
  );
}
