-- ============================================================
-- Seed: Drivers & Vehicles imported from Crew Cab CSV export
-- ============================================================

-- DRIVERS
-- Skipped rows: "Select Driver", "Unassigned", "Services", "Outside Driver"
INSERT INTO public.crew_drivers (full_name, email, phone, status)
VALUES
  ('External Admin Peeters', 'externaladmin@jlsyachts.com', null, 'active'),
  ('Ali Rizwan',             'ali.r@jlsyachts.com',         null, 'active'),
  ('Imran Ul Haq',           'imran@jlsyachts.com',          null, 'active'),
  ('Joel De Leon Mallari',   'joel@jlsyachts.com',           null, 'active'),
  ('Luzviminda Datuin Santiago', 'lucy@jlsyachts.com',       null, 'active'),
  ('Pramod Kumar',           'pramod@jlsyachts.com',         null, 'active'),
  ('Ramjatan Mahato',        'ram@jlsyachts.com',            null, 'active'),
  ('Sathish Somappa',        'sathish@jlsyachts.com',        null, 'active'),
  ('Sharath Kumar Sherigara','sharath@jlsyachts.com',        null, 'active'),
  ('William Praveen D Souza','william.ds@jlsyachts.com',     null, 'active'),
  ('Muhammad Faisal',        'm.faisal@jlsyachts.com',       null, 'active'),
  ('Waheed Murad',           'w.murad@jlsyachts.com',        null, 'active'),
  ('Rambachan Mahato',       'r.mahato@jlsyachts.com',       null, 'active'),
  ('Jon Lopez',              'j.lopez@jlsyachts.com',        null, 'active'),
  ('Mudaseer Mohamed',       'logistics@jlsyachts.com',      null, 'active'),
  ('Alex Bondoc',            'alex@jlsyachts.com',           '+971 506525172', 'active'),
  ('Faisal',                 null,                            null, 'active')
;

-- VEHICLES
-- mileage = best odometer reading available from CSV
-- notes   = type + service history carried over from spreadsheet
INSERT INTO public.crew_vehicles (make, model, registration, mileage, status, notes)
VALUES
  ('Mitsubishi',  'L200',   'N20351', 653741, 'available',
   'Type: SUV | Engine: 2.0L | Last Service: 2024-05-20 | Service KM: 653,741'),

  ('Hyundai',     'H-1',    'U34746', 401046, 'available',
   'Type: Van | Last Service: 2024-04-22 | Service KM: 401,046'),

  ('Toyota',      'Hiace',  'X56383',      0, 'available',
   'Type: Van | Last Service: 2024-10-01'),

  ('Hyundai',     'H-1',    'S57107',      0, 'available', 'Type: Van'),
  ('Hyundai',     'H-1',    'N35369',      0, 'available', 'Type: Van'),
  ('Toyota',      'Yaris',  'U55706',      0, 'available', 'Type: Coupe'),
  ('Nissan',      'Tiida',  'T40976',      0, 'available', 'Type: Coupe'),
  ('Nissan',      'Armada', 'R59041',      0, 'available', 'Type: Van'),
  ('Toyota',      'Hiace',  'W15356',      0, 'available', 'Type: Van'),
  ('Ford',        'F150',   'J99137',      0, 'available', 'Type: Pickup'),

  ('Volkswagen',  'Jetta',  'K78124', 250150, 'available',
   'Type: Sedan | Last Service: 2024-05-14 | Odometer: 250,150 km'),

  ('Ford',        'F150',   'P42413',      0, 'available', 'Type: Pickup'),
  ('Hyundai',     'H-1',    'Y51971',      0, 'available', 'Type: Van'),
  ('Nissan',      'Tiida',  'D64328',      0, 'available', 'Type: Coupe'),
  ('Nissan',      'Urvan',  'M71081',      0, 'available', 'Type: Van'),
  ('Ram',         'Ram',    'Z61308',      0, 'available', 'Type: Pickup'),
  ('Hyundai',     'H1',     'Z69885',      0, 'available', 'Type: Van')
;
