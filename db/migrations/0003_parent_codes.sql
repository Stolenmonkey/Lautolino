-- Silbenflug 0003: Aktivierungscodes für Eltern bekommen einen Suchwert (HMAC mit geheimem Pfeffer), damit ein Code ohne Durchsuchen aller Codes gefunden wird.
ALTER TABLE parent_activation_codes ADD COLUMN code_lookup TEXT;
CREATE UNIQUE INDEX parent_code_lookup ON parent_activation_codes(code_lookup) WHERE code_lookup IS NOT NULL;
CREATE INDEX parent_devices_student ON parent_devices(student_id);
