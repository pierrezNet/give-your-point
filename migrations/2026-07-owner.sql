-- Migration owner : Emmanuel devient owner de l'application
-- L'owner hérite de tous les droits (superadmin, admin, member) et accède à la console /owner.html
-- qui liste toutes les sociétés inscrites.

UPDATE users SET role = 'owner' WHERE id = '<uuid-masqué>';
