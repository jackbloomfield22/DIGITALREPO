"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser, setUserRole } from "@/lib/actions/admin";
import { USER_ROLES } from "@/lib/taxonomy";
import { useToast } from "@/components/toast";

export function UserAdmin({
  users,
}: {
  users: { id: string; name: string; email: string; role: string }[];
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "VIEWER" });
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div>
              <span className="font-medium">{u.name}</span>
              <span className="ml-2 text-muted">{u.email}</span>
            </div>
            <select
              aria-label={`Role for ${u.name}`}
              className="!w-auto"
              value={u.role}
              onChange={async (e) => {
                const res = await setUserRole(u.id, e.target.value);
                toast(res.ok ? "Role updated" : (res.error ?? "Failed"), res.ok ? {} : { tone: "error" });
                router.refresh();
              }}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {!adding ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
          + Add User
        </button>
      ) : (
        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <input type="text" placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="email" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="password" placeholder="Password (min 8 chars)" aria-label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="flex gap-2 sm:col-span-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const res = await createUser(form);
                if (res.ok) {
                  toast("User created");
                  setAdding(false);
                  setForm({ name: "", email: "", password: "", role: "VIEWER" });
                  router.refresh();
                } else toast(res.error ?? "Failed", { tone: "error" });
              }}
            >
              Create User
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
