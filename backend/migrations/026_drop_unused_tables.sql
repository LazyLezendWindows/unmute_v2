-- Device checks for free trials were removed (every account gets its own trial), so these tables
-- are no longer read or written. Re-runnable.
DROP TABLE IF EXISTS device_fingerprints;
DROP TABLE IF EXISTS trial_devices;
