"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { api, ClientApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader, DefinitionList } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatCompactNumber } from "@/lib/format";

type ProfileTag = { tagId: string; name: string };

type ProfileValues = {
  displayName: string;
  firstName: string;
  category: string;
  location: string;
  followerCountRaw: string;
  followerCountNumeric: number | null;
  email: string;
  phone: string;
  rate: string;
  notes: string;
};

/**
 * The read-only profile card plus an inline editor. Details entered here come
 * from the operator's own records — the app never collects follower or contact
 * data from social platforms (§15 / SEC-007), so there is nothing to fetch
 * automatically; the form simply makes the fields editable in one place.
 */
export function ProfilePanel({
  influencerId,
  canEdit,
  tags,
  values,
}: {
  influencerId: string;
  canEdit: boolean;
  tags: ProfileTag[];
  values: ProfileValues;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileValues>(values);

  function set<K extends keyof ProfileValues>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startEditing() {
    setForm(values);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/influencers/${influencerId}`, {
        displayName: form.displayName.trim(),
        firstName: form.firstName.trim() || null,
        category: form.category.trim(),
        location: form.location.trim(),
        followerCountRaw: form.followerCountRaw.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        rate: form.rate.trim() || null,
        notes: form.notes.trim(),
      });
      toast.success("Profile updated", "The creator's details were saved.");
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardHeader
          title="Edit profile"
          description="Details you record come from your own lists — nothing is collected from social platforms."
        />
        <div className="space-y-4 p-5">
          <Field label="Display name" htmlFor="edit-displayName">
            <Input
              id="edit-displayName"
              value={form.displayName}
              onChange={(event) => set("displayName", event.target.value)}
              maxLength={200}
              disabled={saving}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="edit-firstName">
              <Input
                id="edit-firstName"
                value={form.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                maxLength={100}
                disabled={saving}
              />
            </Field>
            <Field label="Category" htmlFor="edit-category">
              <Input
                id="edit-category"
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                maxLength={200}
                disabled={saving}
              />
            </Field>
            <Field label="Location" htmlFor="edit-location">
              <Input
                id="edit-location"
                value={form.location}
                onChange={(event) => set("location", event.target.value)}
                maxLength={200}
                disabled={saving}
              />
            </Field>
            <Field
              label="Followers"
              htmlFor="edit-followers"
              hint="From your own list, e.g. 50000 or 50K."
            >
              <Input
                id="edit-followers"
                value={form.followerCountRaw}
                onChange={(event) => set("followerCountRaw", event.target.value)}
                maxLength={50}
                inputMode="numeric"
                disabled={saving}
              />
            </Field>
            <Field label="Email" htmlFor="edit-email">
              <Input
                id="edit-email"
                type="email"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
                maxLength={200}
                disabled={saving}
              />
            </Field>
            <Field label="Phone" htmlFor="edit-phone">
              <Input
                id="edit-phone"
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
                maxLength={50}
                disabled={saving}
              />
            </Field>
            <Field label="Expected rate" htmlFor="edit-rate">
              <Input
                id="edit-rate"
                value={form.rate}
                onChange={(event) => set("rate", event.target.value)}
                maxLength={200}
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="edit-notes">
            <Textarea
              id="edit-notes"
              rows={3}
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              maxLength={4000}
              disabled={saving}
            />
          </Field>
          {error ? <FormError>{error}</FormError> : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              icon={saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : undefined}
            >
              {saving ? "Saving…" : "Save details"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Profile"
        action={
          canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={startEditing}
              icon={<Pencil className="size-3.5" aria-hidden />}
            >
              Edit
            </Button>
          ) : undefined
        }
      />
      <div className="p-5">
        <DefinitionList
          columns={1}
          items={[
            { label: "First name", value: values.firstName || "—" },
            { label: "Category", value: values.category || "—" },
            { label: "Location", value: values.location || "—" },
            {
              label: "Followers (supplied)",
              value: values.followerCountNumeric
                ? `${formatCompactNumber(values.followerCountNumeric)} (${values.followerCountRaw})`
                : values.followerCountRaw || "—",
            },
            { label: "Email", value: values.email || "—" },
            { label: "Phone", value: values.phone || "—" },
            { label: "Expected rate", value: values.rate || "—" },
            {
              label: "Tags",
              value:
                tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag.tagId}>{tag.name}</Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
        {values.notes ? (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-[13px] leading-6 text-slate-600">
            {values.notes}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
