/**
 * One-time seed script: imports drivers and vehicles from CSV data.
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-crew-data.mjs
 *
 * Get the service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role secret
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cqzdroabjcdyncfqwawy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY env var is not set.");
  console.error("    Run:  SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-crew-data.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── DRIVERS ────────────────────────────────────────────────────────────────
const drivers = [
  { full_name: "External Admin Peeters", email: "externaladmin@jlsyachts.com" },
  { full_name: "Ali Rizwan",             email: "ali.r@jlsyachts.com"         },
  { full_name: "Imran Ul Haq",           email: "imran@jlsyachts.com"          },
  { full_name: "Joel De Leon Mallari",   email: "joel@jlsyachts.com"           },
  { full_name: "Luzviminda Datuin Santiago", email: "lucy@jlsyachts.com"       },
  { full_name: "Pramod Kumar",           email: "pramod@jlsyachts.com"         },
  { full_name: "Ramjatan Mahato",        email: "ram@jlsyachts.com"            },
  { full_name: "Sathish Somappa",        email: "sathish@jlsyachts.com"        },
  { full_name: "Sharath Kumar Sherigara", email: "sharath@jlsyachts.com"       },
  { full_name: "William Praveen D Souza", email: "william.ds@jlsyachts.com"    },
  { full_name: "Muhammad Faisal",        email: "m.faisal@jlsyachts.com"       },
  { full_name: "Waheed Murad",           email: "w.murad@jlsyachts.com"        },
  { full_name: "Rambachan Mahato",       email: "r.mahato@jlsyachts.com"       },
  { full_name: "Jon Lopez",              email: "j.lopez@jlsyachts.com"        },
  { full_name: "Mudaseer Mohamed",       email: "logistics@jlsyachts.com"      },
  { full_name: "Alex Bondoc",            email: "alex@jlsyachts.com",  phone: "+971 506525172" },
  { full_name: "Faisal",                 email: null,                   phone: null             },
].map((d) => ({ status: "active", phone: null, ...d }));

// ─── VEHICLES ───────────────────────────────────────────────────────────────
const vehicles = [
  { make: "Mitsubishi", model: "L200",   registration: "N20351", mileage: 653741,
    notes: "Type: SUV | Engine: 2.0L | Last Service: 2024-05-20 | Service KM: 653,741" },

  { make: "Hyundai",    model: "H-1",    registration: "U34746", mileage: 401046,
    notes: "Type: Van | Last Service: 2024-04-22 | Service KM: 401,046" },

  { make: "Toyota",     model: "Hiace",  registration: "X56383", mileage: 0,
    notes: "Type: Van | Last Service: 2024-10-01" },

  { make: "Hyundai",    model: "H-1",    registration: "S57107", mileage: 0, notes: "Type: Van" },
  { make: "Hyundai",    model: "H-1",    registration: "N35369", mileage: 0, notes: "Type: Van" },
  { make: "Toyota",     model: "Yaris",  registration: "U55706", mileage: 0, notes: "Type: Coupe" },
  { make: "Nissan",     model: "Tiida",  registration: "T40976", mileage: 0, notes: "Type: Coupe" },
  { make: "Nissan",     model: "Armada", registration: "R59041", mileage: 0, notes: "Type: Van" },
  { make: "Toyota",     model: "Hiace",  registration: "W15356", mileage: 0, notes: "Type: Van" },
  { make: "Ford",       model: "F150",   registration: "J99137", mileage: 0, notes: "Type: Pickup" },

  { make: "Volkswagen", model: "Jetta",  registration: "K78124", mileage: 250150,
    notes: "Type: Sedan | Last Service: 2024-05-14 | Odometer: 250,150 km" },

  { make: "Ford",       model: "F150",   registration: "P42413", mileage: 0, notes: "Type: Pickup" },
  { make: "Hyundai",    model: "H-1",    registration: "Y51971", mileage: 0, notes: "Type: Van" },
  { make: "Nissan",     model: "Tiida",  registration: "D64328", mileage: 0, notes: "Type: Coupe" },
  { make: "Nissan",     model: "Urvan",  registration: "M71081", mileage: 0, notes: "Type: Van" },
  { make: "Ram",        model: "Ram",    registration: "Z61308", mileage: 0, notes: "Type: Pickup" },
  { make: "Hyundai",    model: "H1",     registration: "Z69885", mileage: 0, notes: "Type: Van" },
].map((v) => ({ status: "available", capacity: 4, ...v }));

// ─── INSERT ──────────────────────────────────────────────────────────────────
async function run() {
  console.log("🚗  Seeding crew_drivers…");
  const { error: de } = await supabase.from("crew_drivers").insert(drivers);
  if (de) {
    console.error("  ❌ drivers:", de.message);
  } else {
    console.log(`  ✅ Inserted ${drivers.length} drivers`);
  }

  console.log("🚌  Seeding crew_vehicles…");
  const { error: ve } = await supabase.from("crew_vehicles").insert(vehicles);
  if (ve) {
    console.error("  ❌ vehicles:", ve.message);
  } else {
    console.log(`  ✅ Inserted ${vehicles.length} vehicles`);
  }

  console.log("Done.");
}

run().catch(console.error);
