import { useEffect, useState } from "react";

import type { TenantCredentials } from "../../lib/apiClient.js";
import { fetchStudentInvoicePdf } from "../../lib/financeApi.js";

export function InvoiceDownloadButton({ invoiceId, creds }: { invoiceId: string; creds: TenantCredentials }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function download() {
    setLoading(true);
    setError(false);
    try {
      const blob = await fetchStudentInvoicePdf(invoiceId, creds);
      const nextUrl = URL.createObjectURL(blob);
      setUrl(nextUrl);
      const link = document.createElement("a");
      link.href = nextUrl;
      link.download = `facture-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-xs text-brand-teal hover:underline disabled:opacity-50"
        disabled={loading}
        onClick={() => void download()}
      >
        {loading ? "Préparation du PDF…" : "Télécharger la facture"}
      </button>
      {url && (
        <a className="block text-xs text-teal-700 underline" href={url} download={`facture-${invoiceId}.pdf`}>
          Télécharger le document PDF
        </a>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          Le téléchargement de la facture a échoué. Réessayez.
        </p>
      )}
    </div>
  );
}
