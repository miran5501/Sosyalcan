# SosyalCan — Mobil

Expo (React Native) ile yazılmış mobil uygulama. `apps/web` içindeki API'yi kullanır.

## Çalıştırma

Önce web uygulamasını başlat (`cd apps/web && npm run dev`), sonra:

```sh
npm install
npx expo start
```

Android emülatörü varsayılan olarak `http://10.0.2.2:3000` adresine bağlanır. Gerçek telefonda bilgisayarın yerel IP adresini ver:

```sh
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo start
```

## Ekranlar

Ana sayfa, Görevler, Program (çekim ve randevular), Bildirimler.
