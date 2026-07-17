import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, MapPin, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { useGoogleMaps } from "@/lib/google-maps";
import { LocationPickerMap } from "@/components/maps/location-picker-map";

type Location = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string;
  notes: string | null;
};

const EMPTY = { name: "", address: "", latitude: "", longitude: "", category: "other", notes: "" };
const CATEGORIES = ["airport", "marina", "hotel", "office", "restaurant", "other"] as const;
const CAT_LABELS: Record<string, string> = {
  airport: "Airport", marina: "Marina", hotel: "Hotel",
  office: "Office", restaurant: "Restaurant", other: "Other",
};
const CAT_COLORS: Record<string, string> = {
  airport: "bg-sky-500/15 text-sky-400",
  marina: "bg-blue-500/15 text-blue-400",
  hotel: "bg-purple-500/15 text-purple-400",
  office: "bg-amber-500/15 text-amber-400",
  restaurant: "bg-orange-500/15 text-orange-400",
  other: "bg-muted text-muted-foreground",
};

function CatBadge({ cat }: { cat: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CAT_COLORS[cat] ?? CAT_COLORS.other}`}>
      {CAT_LABELS[cat] ?? cat}
    </span>
  );
}

export function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const { maps, ready } = useGoogleMaps();

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("crew_locations").select("*").order("name"));
    if (error) toast.error(error.message);
    else setLocations(data as Location[]);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(l: Location) {
    setEditing(l);
    setForm({
      name: l.name, address: l.address ?? "",
      latitude: l.latitude ? String(l.latitude) : "",
      longitude: l.longitude ? String(l.longitude) : "",
      category: l.category, notes: l.notes ?? "",
    });
    setOpen(true);
  }

  async function geocodeAddress() {
    if (!form.address.trim()) { toast.error("Enter an address first"); return; }
    setGeocoding(true);
    try {
      // Try UAE-specific first, then global fallback
      const queries = [
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&countrycodes=ae&format=json&limit=1&addressdetails=1`,
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address + ", United Arab Emirates")}&format=json&limit=1&addressdetails=1`,
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&format=json&limit=1&addressdetails=1`,
      ];

      let found: any = null;
      for (const url of queries) {
        const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "JLS-Navigator/1.0" } });
        const data = await res.json() as any[];
        if (data.length) { found = data[0]; break; }
      }

      if (!found) { toast.error("Address not found — try a shorter address or enter coordinates manually"); return; }
      setForm((f) => ({
        ...f,
        latitude: String(parseFloat(found.lat).toFixed(6)),
        longitude: String(parseFloat(found.lon).toFixed(6)),
      }));
      toast.success("Coordinates found");
    } catch {
      toast.error("Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), address: form.address || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        category: form.category, notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("crew_locations").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Location updated");
      } else {
        const { error } = await (supabase as any).from("crew_locations").insert([payload]);
        if (error) throw error;
        toast.success("Location added");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("crew_locations").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Location removed"); await load(); }
    setDeleteTarget(null);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => {
    if (!q.trim()) return locations;
    const s = q.toLowerCase();
    return locations.filter((l) =>
      [l.name, l.address, l.category, CAT_LABELS[l.category]]
        .some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [locations, q]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Locations</h1>
          <span className="text-xs text-muted-foreground">({locations.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search locations…"
              className="h-8 w-52 pl-8 text-xs"
            />
          </div>
          <Button onClick={openNew} size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Location
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MapPin className="h-10 w-10 opacity-30" />
            <p className="text-sm">{q ? `No locations matching "${q}"` : "No saved locations yet."}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  {["Name", "Address", "Category", "Coordinates", "Notes", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-sm">{l.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">{l.address ?? "—"}</td>
                    <td className="px-3 py-1.5"><CatBadge cat={l.category} /></td>
                    <td className="px-3 py-1.5">
                      {l.latitude && l.longitude ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=15/${l.latitude}/${l.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {Number(l.latitude).toFixed(4)}, {Number(l.longitude).toFixed(4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[150px] truncate">{l.notes ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(l)} className="h-7 w-7 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(l)}
                          className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={set("name")} placeholder="e.g. Dubai International Airport T3" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <div className="flex gap-2">
                <Input value={form.address} onChange={set("address")} placeholder="Enter full address…" className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={geocodeAddress} disabled={geocoding} className="shrink-0 gap-1 h-8">
                  {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />} Geocode
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Latitude</Label><Input type="number" step="0.000001" value={form.latitude} onChange={set("latitude")} placeholder="25.2532" /></div>
              <div className="space-y-1.5"><Label>Longitude</Label><Input type="number" step="0.000001" value={form.longitude} onChange={set("longitude")} placeholder="55.3657" /></div>
            </div>
            {maps ? (
              <div className="space-y-1.5">
                <Label>Drop a pin</Label>
                <LocationPickerMap
                  maps={maps}
                  value={{ lat: form.latitude ? Number(form.latitude) : null, lng: form.longitude ? Number(form.longitude) : null }}
                  onChange={(p) =>
                    setForm((f) => ({
                      ...f,
                      latitude: p.lat.toFixed(6),
                      longitude: p.lng.toFixed(6),
                      address: p.address && (p.source === "search" || !f.address.trim()) ? p.address : f.address,
                    }))
                  }
                  onClear={() => setForm((f) => ({ ...f, latitude: "", longitude: "" }))}
                />
              </div>
            ) : ready ? (
              <p className="text-[11px] text-muted-foreground">
                Tip: add the Google Maps API key under Settings → Integrations → Google Maps to drop a pin on a map instead of geocoding.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CAT_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={set("notes")} placeholder="Any notes…" /></div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleSave} disabled={busy} className="gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save Changes" : "Add Location"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete location?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
