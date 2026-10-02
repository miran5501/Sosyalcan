/**
 * KVKK aydınlatma metni TASLAĞI (6698 sayılı Kanun m.10'daki zorunlu başlıklar ve m.11'deki haklar).
 *
 * Bu bir şablondur, hukuki danışmanlık değildir: [köşeli parantez] içindeki yerler ajansın kendi
 * bilgileriyle doldurulmalı ve metin yayından önce bir hukukçuya kontrol ettirilmelidir.
 * Ayarlar → KVKK sayfasından düzenlenir; düzenlenmiş metin veritabanında saklanır.
 *
 * Biçim: "## " ile başlayan satır başlık, "- " ile başlayan satır madde, boş satır paragraf arası.
 */
export const PRIVACY_TEMPLATE = `## Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") madde 10 uyarınca, SosyalCan Komuta Merkezi uygulamasını kullanan çalışanlarımızı ve kayıtlarında bilgileri bulunan müşterilerimizi bilgilendirmek amacıyla hazırlanmıştır.

## 1. Veri Sorumlusu

[AJANSIN TİCARİ UNVANI], [AÇIK ADRES], [MERSİS NO / VERGİ NO]. İletişim: [KVKK İLETİŞİM E-POSTASI], [TELEFON].

## 2. İşlenen Kişisel Veriler

- Çalışanlar (uygulama kullanıcıları): ad soyad, e-posta adresi, rol, giriş zamanları, oturum ve cihaz bilgileri (IP adresi, tarayıcı/uygulama bilgisi), uygulama içinde yapılan işlemlerin kaydı.
- Müşteriler ve müşteri yetkilileri: ad / unvan, iletişim bilgisi, notlar, çekim ve randevu bilgileri, ödeme planları ve tahsilat kayıtları.
- [VARSA DİĞER VERİ KATEGORİLERİ]

## 3. İşleme Amaçları

- Ajansın iş süreçlerinin (görev, çekim, randevu, teslim) planlanması ve yürütülmesi,
- müşteri ilişkilerinin ve sözleşmeden doğan yükümlülüklerin yerine getirilmesi,
- finans, muhasebe ve tahsilat işlemlerinin yürütülmesi,
- bilgi güvenliğinin sağlanması (yetkisiz erişimin önlenmesi, işlem kayıtlarının tutulması),
- yasal yükümlülüklerin yerine getirilmesi ve yetkili kurumların taleplerinin karşılanması.

## 4. Hukuki Sebepler (KVKK m.5)

- Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (m.5/2-c),
- veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi (m.5/2-ç), örneğin vergi ve ticaret mevzuatı gereği kayıt saklama,
- ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati (m.5/2-f), örneğin bilgi güvenliği kayıtları.

## 5. Toplama Yöntemi

Kişisel veriler; uygulamaya çalışanlarımız tarafından girilmesi, giriş ve kullanım sırasında sistem tarafından otomatik olarak kaydedilmesi (işlem kayıtları, IP adresi) yoluyla elektronik ortamda toplanır.

## 6. Aktarım

Kişisel veriler; hizmet aldığımız barındırma ve altyapı sağlayıcılarına ([SUNUCU / VERİTABANI SAĞLAYICISI VE ÜLKESİ]), e-posta gönderim hizmeti sağlayıcısına ([E-POSTA SAĞLAYICISI]), yasal zorunluluk halinde yetkili kamu kurum ve kuruluşlarına aktarılabilir. Yurt dışına aktarım söz konusuysa KVKK m.9 kapsamındaki şartlara uyulur: [YURT DIŞI AKTARIM DAYANAĞI].

## 7. Saklama Süreleri

- İşlem (denetim) kayıtları: [Ayarlar'daki süre] gün,
- uygulama içi bildirimler: [Ayarlar'daki süre] gün,
- gönderilen e-posta kayıtları: [Ayarlar'daki süre] gün,
- finans ve tahsilat kayıtları: ilgili mevzuatta öngörülen süre boyunca ([ÖRN. VERGİ USUL KANUNU'NA GÖRE 5 YIL]),
- süresi dolan veriler otomatik olarak silinir veya anonim hale getirilir.

## 8. Çerezler

Uygulama yalnızca oturumun güvenli şekilde sürdürülmesi için zorunlu çerezler ve tema tercihi için tarayıcı depolaması kullanır; reklam veya izleme çerezi kullanılmaz.

## 9. İlgili Kişinin Hakları (KVKK m.11)

KVKK m.11 uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, KVKK m.7 çerçevesinde silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.

Uygulama kullanıcıları kendi verilerinin bir kopyasını Hesabım sayfasındaki "Verilerimi indir" bağlantısıyla alabilir.

## 10. Başvuru

Haklarınıza ilişkin taleplerinizi [KVKK İLETİŞİM E-POSTASI] adresine veya [ADRES]'e yazılı olarak iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.

Son güncelleme: [TARİH]`;
