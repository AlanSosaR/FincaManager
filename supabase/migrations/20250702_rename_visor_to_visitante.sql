ALTER TABLE usuario_empresas DROP CONSTRAINT IF EXISTS usuario_empresas_rol_check;
ALTER TABLE usuario_empresas ADD CONSTRAINT usuario_empresas_rol_check CHECK (rol IN ('propietario', 'admin', 'visitante'));

ALTER TABLE invitaciones DROP CONSTRAINT IF EXISTS invitaciones_rol_check;
ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_rol_check CHECK (rol IN ('admin', 'visitante'));

UPDATE usuario_empresas SET rol = 'visitante' WHERE rol = 'visor';
UPDATE invitaciones SET rol = 'visitante' WHERE rol = 'visor';
