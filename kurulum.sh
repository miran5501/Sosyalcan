#!/bin/sh
# SosyalCan tek komutla kurulum (Linux / macOS). Gerekli: Docker (compose eklentisiyle) ve openssl.
#   sh kurulum.sh
# .env yoksa gizli anahtarları ve ilk Admin şifresini rastgele üretir, ardından her şeyi Docker ile kurar.
set -e
cd "$(dirname "$0")"

# \r de silinir: Windows'taki Git Bash'te openssl satır sonuna \r ekler.
secret() { openssl rand -base64 "$1" | tr -d '+/=\r\n'; }

docker info >/dev/null 2>&1 || { echo "Docker çalışmıyor. Docker'ı başlatıp tekrar dene."; exit 1; }

if [ ! -f .env ]; then
  printf "İlk Admin e-postası (boş bırakırsan admin@sosyalcan.local): "
  read -r EMAIL
  [ -n "$EMAIL" ] || EMAIL="admin@sosyalcan.local"
  ADMIN_PASSWORD="Sc-$(secret 9)7"
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 24)|" \
      -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(secret 48)|" \
      -e "s|^CRON_SECRET=.*|CRON_SECRET=$(secret 24)|" \
      -e "s|^SEED_ADMIN_EMAIL=.*|SEED_ADMIN_EMAIL=$EMAIL|" \
      -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=$ADMIN_PASSWORD|" \
      .env.example > .env
  echo ".env oluşturuldu (gizli anahtarlar rastgele üretildi)."
else
  echo ".env zaten var, olduğu gibi kullanılıyor."
fi

echo "Docker imajları hazırlanıyor ve başlatılıyor (ilk seferde birkaç dakika sürer)..."
docker compose --profile app up -d --build

PORT=$(grep '^APP_PORT=' .env | cut -d= -f2)
[ -n "$PORT" ] || PORT=3000
echo "Uygulamanın açılması bekleniyor..."
i=0
while [ $i -lt 60 ]; do
  curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break
  i=$((i + 1)); sleep 2
done

echo ""
echo "SosyalCan hazır: http://localhost:$PORT"
echo "İlk giriş bilgileri (.env dosyasında da var; ilk girişte şifre değiştirilir):"
grep -E '^SEED_ADMIN_(EMAIL|PASSWORD)=' .env | sed 's/^/  /'
