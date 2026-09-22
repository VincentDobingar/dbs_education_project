import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addAdminSupportTicketMessage,
  assignSupportTicket,
  getAdminSupportTicket,
  listAdminSupportTickets,
  updateSupportTicketStatus,
  type SupportTicketStatus,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];

export function AdminSupportTicketsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "">("");
  const tickets = useQuery({
    queryKey: ["admin-support-tickets", statusFilter],
    queryFn: () => listAdminSupportTickets({ ...(statusFilter ? { status: statusFilter } : {}) }, creds),
  });

  const [selectedId, setSelectedId] = useState("");
  const selected = useQuery({
    queryKey: ["admin-support-ticket", selectedId],
    queryFn: () => getAdminSupportTicket(selectedId, creds),
    enabled: Boolean(selectedId),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-support-ticket", selectedId] });
  }

  const [assigneeId, setAssigneeId] = useState("");
  const assignMutation = useMutation({
    mutationFn: () => assignSupportTicket(selectedId, assigneeId, creds),
    onSuccess: () => {
      invalidate();
      setAssigneeId("");
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: SupportTicketStatus) => updateSupportTicketStatus(selectedId, status, creds),
    onSuccess: invalidate,
  });

  const [replyBody, setReplyBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const replyMutation = useMutation({
    mutationFn: () => addAdminSupportTicketMessage(selectedId, replyBody, isInternalNote, creds),
    onSuccess: () => {
      invalidate();
      setReplyBody("");
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.supportTickets.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.supportTickets.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <select
          className="input w-56"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as SupportTicketStatus | "")}
        >
          <option value="">{t("admin.common.allStatuses")}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`supportTickets.status.${status}`)}
            </option>
          ))}
        </select>

        {(tickets.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
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
                        onClick={() => setSelectedId(ticket.id)}
                      >
                        {t("admin.common.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected.data ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{selected.data.subject}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t(`supportTickets.status.${selected.data.status}`)} ·{" "}
            {selected.data.assignedToUserId
              ? t("admin.supportTickets.assignedTo", { userId: selected.data.assignedToUserId })
              : t("admin.supportTickets.unassigned")}
          </p>

          <ul className="mt-3 space-y-2 text-sm">
            {(selected.data.messages ?? []).map((message) => (
              <li
                key={message.id}
                className={`border-b border-slate-100 pb-2 ${message.isInternalNote ? "text-amber-700" : "text-slate-700"}`}
              >
                {message.isInternalNote ? `[${t("admin.supportTickets.internalNote")}] ` : ""}
                {message.body}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <select
              className="input w-56"
              value={selected.data.status}
              onChange={(event) => statusMutation.mutate(event.target.value as SupportTicketStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`supportTickets.status.${status}`)}
                </option>
              ))}
            </select>
            <input
              placeholder={t("admin.supportTickets.assignToUserId")}
              className="input w-56"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!assigneeId || assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              {t("admin.supportTickets.assign")}
            </Button>
          </div>

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
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(event) => setIsInternalNote(event.target.checked)}
              />
              {t("admin.supportTickets.internalNote")}
            </label>
            <Button type="submit" variant="secondary" disabled={!replyBody || replyMutation.isPending}>
              {t("supportTickets.reply")}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
