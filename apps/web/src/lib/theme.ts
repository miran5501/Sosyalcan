/** Tema tercihinin tarayıcıda saklandığı anahtar ("light" | "dark" | "system"). */
export const THEME_STORAGE_KEY = "theme";

/**
 * Sayfa ilk boyanmadan önce temayı uygular (layout <head> içinde çalışır); böylece koyu modda
 * açılışta beyaz bir an görünmez. Sistem teması değişirse ("Sistem" seçiliyken) anında uyar,
 * yazdırırken her zaman açık temaya geçer.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k='${THEME_STORAGE_KEY}';
var m=window.matchMedia('(prefers-color-scheme: dark)');
var apply=function(){var s=localStorage.getItem(k)||'system';document.documentElement.classList.toggle('dark',s==='dark'||(s==='system'&&m.matches));};
apply();
m.addEventListener('change',apply);
window.addEventListener('beforeprint',function(){document.documentElement.classList.remove('dark');});
window.addEventListener('afterprint',apply);
}catch(e){}})();`;
