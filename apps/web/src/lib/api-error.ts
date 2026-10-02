/**
 * HTTP durum kodu taşıyan iş kuralı hatası (400, 403, 404, 409...). Ayrı dosyada: oturum
 * modülünü (next-auth) yüklemeden servislerden ve saf birim testlerinden kullanılabilsin.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
