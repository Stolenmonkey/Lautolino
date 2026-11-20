-- Klartext der gültigen Codes, damit Lehrkräfte sie dauerhaft sehen und austeilen können. Login nutzt weiter nur Hash/Lookup.
ALTER TABLE student_codes ADD COLUMN code_plain TEXT;
ALTER TABLE parent_codes ADD COLUMN code_plain TEXT;
