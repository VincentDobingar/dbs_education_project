import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const contactFormSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(10),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

export function ContactPage(): ReactNode {
  const { t } = useTranslation("marketing");
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({ resolver: zodResolver(contactFormSchema) });

  const onSubmit = handleSubmit(() => {
    // No backend endpoint yet — see contact.form.note. Wired to a real support
    // channel in Phase 10 (communication module).
    setSubmitted(true);
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-900">{t("contact.title")}</h1>
      <p className="mt-2 text-slate-600">{t("contact.subtitle")}</p>

      <div className="mt-8 grid gap-2 text-sm text-slate-600">
        <p>
          <span className="font-medium text-slate-900">{t("contact.email.label")} : </span>
          contact@edumanage.africa
        </p>
      </div>

      {submitted ? (
        <p className="mt-8 rounded-md bg-brand-teal/10 p-4 text-brand-night">{t("contact.form.submit")} ✓</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              {t("contact.form.name")}
            </label>
            <input id="name" type="text" className="input mt-1" {...register("name")} />
            {errors.name ? <p className="mt-1 text-sm text-red-600">{errors.name.message}</p> : null}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              {t("contact.form.email")}
            </label>
            <input id="email" type="email" className="input mt-1" {...register("email")} />
            {errors.email ? <p className="mt-1 text-sm text-red-600">{errors.email.message}</p> : null}
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-slate-700">
              {t("contact.form.message")}
            </label>
            <textarea id="message" rows={5} className="input mt-1" {...register("message")} />
            {errors.message ? <p className="mt-1 text-sm text-red-600">{errors.message.message}</p> : null}
          </div>

          <Button type="submit" variant="secondary" disabled={isSubmitting}>
            {t("contact.form.submit")}
          </Button>

          <p className="text-xs text-slate-400">{t("contact.form.note")}</p>
        </form>
      )}
    </div>
  );
}
