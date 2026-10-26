import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { formText } from "../../lib/formData.js";
import {
  confirmParentContactChange,
  getParentProfile,
  requestParentContactChange,
  updateParentProfile,
} from "../../lib/parentAccountApi.js";
import { loadPortalSession, savePortalSession } from "../../lib/portalSession.js";

export function ParentProfilePage(): ReactNode {
  const session = loadPortalSession()!;
  const client = useQueryClient();
  const [challengeId, setChallengeId] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "PHONE">("EMAIL");
  const profile = useQuery({
    queryKey: ["parent-profile", session.accessToken],
    queryFn: () => getParentProfile(session.accessToken),
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["parent-profile", session.accessToken] });
  };
  const update = useMutation({
    mutationFn: (data: FormData) =>
      updateParentProfile(
        {
          firstName: formText(data, "firstName"),
          lastName: formText(data, "lastName"),
          address: formText(data, "address") || null,
        },
        session.accessToken,
      ),
    onSuccess: refresh,
  });
  const requestCode = useMutation({
    mutationFn: (data: FormData) =>
      requestParentContactChange(
        { channel, value: formText(data, "value"), password: formText(data, "password") },
        session.accessToken,
      ),
    onSuccess: (result) => setChallengeId(result.id),
  });
  const confirm = useMutation({
    mutationFn: (data: FormData) =>
      confirmParentContactChange(challengeId, formText(data, "code"), session.accessToken),
    onSuccess: (result) => {
      if (result.email) savePortalSession({ ...session, email: result.email });
      setChallengeId("");
      refresh();
    },
  });
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Mon profil parent / tuteur</h1>
      <p className="text-slate-600">
        Vos coordonnées sont communes aux établissements où votre identité de tuteur principal a été vérifiée.
        Les informations scolaires de vos enfants restent gérées par chaque établissement.
      </p>
      {profile.isPending && <p>Chargement…</p>}
      {profile.isError && <p role="alert">Impossible de charger votre profil.</p>}
      {profile.data && (
        <>
          {profile.data?.photoUrl && (
            <img
              src={profile.data.photoUrl}
              alt="Ma photo de parent / tuteur"
              className="h-28 w-28 rounded-full border object-cover"
            />
          )}
          <form
            key={`${profile.data.firstName}-${profile.data.lastName}-${profile.data.address}`}
            className="space-y-3 rounded-lg border bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(new FormData(event.currentTarget));
            }}
          >
            <label className="block">
              Prénom
              <input
                className="input block w-full"
                name="firstName"
                required
                maxLength={100}
                defaultValue={profile.data.firstName}
              />
            </label>
            <label className="block">
              Nom
              <input
                className="input block w-full"
                name="lastName"
                required
                maxLength={100}
                defaultValue={profile.data.lastName}
              />
            </label>
            <label className="block">
              Adresse
              <input
                className="input block w-full"
                name="address"
                maxLength={500}
                defaultValue={profile.data.address ?? ""}
              />
            </label>
            <p>
              Email : {profile.data.email ?? "—"} · Téléphone : {profile.data.phone ?? "—"}
            </p>
            <Button type="submit" disabled={update.isPending}>
              Enregistrer et synchroniser
            </Button>
            {update.isSuccess && (
              <p role="status" className="text-teal-700">
                Profil enregistré et synchronisé avec les établissements liés.
              </p>
            )}
            {update.isError && (
              <p role="alert" className="text-red-600">
                {update.error.message}
              </p>
            )}
          </form>
          <section className="rounded-lg border bg-white p-5">
            <h2 className="font-semibold">Mes établissements liés</h2>
            <ul>
              {profile.data.schools?.map((school) => (
                <li key={school.id}>{school.name}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-slate-500">
              Le rattachement d'un dossier local à votre profil central nécessite une invitation de
              l'établissement et la vérification du contact destinataire.
            </p>
          </section>
        </>
      )}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Modifier mon email ou mon téléphone</h2>
        <p className="my-2 text-sm text-slate-600">
          Confirmez votre mot de passe, puis le code envoyé au nouveau contact. Aucune modification n'est
          appliquée avant vérification.
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            requestCode.mutate(new FormData(event.currentTarget));
          }}
        >
          <label className="block">
            Contact à modifier
            <select
              className="input block"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as "EMAIL" | "PHONE");
                setChallengeId("");
              }}
            >
              <option value="EMAIL">Email</option>
              <option value="PHONE">Téléphone</option>
            </select>
          </label>
          <label className="block">
            Nouveau contact
            <input
              key={channel}
              className="input block w-full"
              name="value"
              type={channel === "EMAIL" ? "email" : "tel"}
              placeholder={channel === "PHONE" ? "+237600000000" : "parent@exemple.com"}
              required
            />
          </label>
          <label className="block">
            Mot de passe actuel
            <input
              className="input block w-full"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <Button type="submit" disabled={requestCode.isPending}>
            Recevoir le code
          </Button>
          {requestCode.isError && (
            <p role="alert" className="text-red-600">
              {requestCode.error.message}
            </p>
          )}
        </form>
        {challengeId && (
          <form
            className="mt-4 flex flex-wrap gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              confirm.mutate(new FormData(event.currentTarget));
            }}
          >
            <label>
              Code de vérification
              <input
                className="input block"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
              />
            </label>
            <Button type="submit" disabled={confirm.isPending}>
              Confirmer le contact
            </Button>
          </form>
        )}
        {confirm.isError && (
          <p role="alert" className="text-red-600">
            {confirm.error.message}
          </p>
        )}
        {confirm.isSuccess && (
          <p role="status" className="text-teal-700">
            Contact vérifié et synchronisé.
          </p>
        )}
      </section>
    </main>
  );
}
