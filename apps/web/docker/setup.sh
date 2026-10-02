#!/bin/sh
# Konteyner ilk açılışta (ve her güncellemede) çalışır: bekleyen migration'ları uygular, hiç kullanıcı
# yoksa ilk Admin'i oluşturur. Veri silmez; tekrar tekrar çalıştırmak güvenlidir.
set -e
echo "Veritabanı şeması güncelleniyor..."
npx prisma migrate deploy
if [ -n "$SEED_ADMIN_EMAIL" ]; then
  COUNT=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);return p.\$disconnect()})")
  if [ "$COUNT" = "0" ]; then
    echo "İlk Admin hesabı oluşturuluyor: $SEED_ADMIN_EMAIL"
    SEED_MODE=production npx tsx prisma/seed.ts
  else
    echo "Kullanıcılar zaten var; ilk Admin adımı atlandı."
  fi
fi
echo "Kurulum adımı tamam."
