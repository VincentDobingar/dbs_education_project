import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addTicketMessage,
  createSupportTicket,
  getMyTicket,
  listMyTickets,
  type TicketPriority,
} from "../../lib/communicationApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function SupportTicketsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const tickets = useQuery({
    queryKey: ["support-tickets", session.subdomain],
    queryFn: () => listMyTickets(creds),
  });

  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const createMutation = useMutation({
    mutationFn: () => createSupportTicket({ subject, priority }, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["support-tickets", session.subdomain] });
      setSubject("");
    },
  });

  const [selectedTicketId, setSelectedTicketId] = useState("");
  const selectedTicket = useQuery({
    queryKey: ["support-ticket", session.subdomain, selectedTicketId],
    queryFn: () => getMyTicket(selectedTicketId, creds),
    enabled: Boolean(selectedTicketId),
  });

  const [replyBody, setReplyBody] = useState("");
  const replyMutation = useMutation({
    mutationFn: () => addTicketMessage(selectedTicketId, replyBody, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["support-ticket", session.subdomain, selectedTicketId],
      });
      setReplyBody("");
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("supportTickets.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("supportTickets.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(tickets.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("supportTickets.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("supportTickets.subject")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("supportTickets.priority")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(tickets.data ?? []).map((ticket) => (
                  <tr key={ticket.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{ticket.subject}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {t(`supportTickets.priority.${ticket.priority}`)}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {t(`supportTickets.status.${ticket.status}`)}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        {t("supportTickets.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("supportTickets.form.subject")}
            className="input w-64"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <select
            className="input w-32"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TicketPriority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`supportTickets.priority.${p}`)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={!subject}>
            {t("supportTickets.create")}
          </Button>
        </form>
      </section>

      {selectedTicket.data ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{selectedTicket.data.subject}</h2>

          <ul className="mt-3 space-y-3 text-sm">
            {(selectedTicket.data.messages ?? [])
              .filter((message) => !message.isInternalNote)
              .map((message) => (
                <li key={message.id} className="border-b border-slate-100 pb-2 text-slate-700">
                  {message.body}
                </li>
              ))}
          </ul>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              replyMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("supportTickets.form.reply")}
              className="input w-64"
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!replyBody}>
              {t("supportTickets.reply")}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
