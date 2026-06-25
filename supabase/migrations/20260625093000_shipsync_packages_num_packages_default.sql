-- A package row is at least one parcel; default so inbound SharePoint rows with a
-- blank NumberofPackages (and manual inserts) don't hit the NOT NULL constraint.
alter table shipsync_packages alter column num_packages set default 1;
update shipsync_packages set num_packages = 1 where num_packages is null;
