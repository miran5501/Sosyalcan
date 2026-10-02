-- Teslim kontrol listesi şablonu için yeni seçenek listesi türü.
-- PostgreSQL yeni enum değerinin aynı işlemde kullanılmasına izin vermez; veriler bir sonraki migration'da.
ALTER TYPE "OptionKind" ADD VALUE 'DELIVERY_CHECKLIST';
