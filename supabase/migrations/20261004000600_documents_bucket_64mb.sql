-- Contratos escaneados pueden superar 25 MB; subir tope del bucket a 64 MB
-- y permitir Word además de PDF/imagenes/Excel.

UPDATE storage.buckets
SET
  file_size_limit = 67108864,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
WHERE id = 'documents';
