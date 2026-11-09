<?php
// Okul iletişim okuyucusu (TurkHosting, Türkiye'de çalışır).
// meb.k12.tr okul siteleri yurtdışından gelen bağlantıları kabul etmediği için robot (GitHub) okul sitelerini buradan okur.
// Yalnız *.meb.k12.tr adreslerine gider, bir istekte en fazla 12 okul, saatte en fazla 250 istek (açık vekil olarak kullanılamaz).
// Yalnız okulun kendi sitesinde yayımlanmış e-posta ve telefonu döndürür; hiçbir okula ileti göndermez.
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo json_encode(['hata' => 'POST gerekli']); exit; }
$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) { http_response_code(400); echo json_encode(['hata' => 'girdi']); exit; }
// Saatlik genel sınır
$lf = sys_get_temp_dir() . '/wf_okul_robot_' . date('YmdH');
$cnt = (int)@file_get_contents($lf);
if ($cnt >= 250) { http_response_code(429); echo json_encode(['hata' => 'sınır']); exit; }
@file_put_contents($lf, (string)($cnt + 1), LOCK_EX);
$urls = array_slice(array_values(array_filter((array)($in['urls'] ?? []), function ($u) {
  $h = strtolower((string)parse_url((string)$u, PHP_URL_HOST));
  return $h !== '' && substr($h, -11) === '.meb.k12.tr';
})), 0, 12);
if (!function_exists('curl_multi_init')) { http_response_code(500); echo json_encode(['hata' => 'curl yok']); exit; }
set_time_limit(90);

function fetch_all(array $list) {
  $mh = curl_multi_init(); $hs = [];
  foreach ($list as $i => $u) {
    $c = curl_init($u);
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4,
      CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 12, CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; Wolflano-okul-rehberi/1.0)',
      CURLOPT_MAXFILESIZE => 1500000, CURLOPT_ENCODING => '']);
    curl_multi_add_handle($mh, $c); $hs[$i] = $c;
  }
  do { $st = curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 1.0); } while ($run && $st == CURLM_OK);
  $out = [];
  foreach ($hs as $i => $c) {
    $body = (string)curl_multi_getcontent($c);
    $out[$i] = ['url' => curl_getinfo($c, CURLINFO_EFFECTIVE_URL), 'kod' => curl_getinfo($c, CURLINFO_HTTP_CODE), 'html' => $body];
    curl_multi_remove_handle($mh, $c); curl_close($c);
  }
  curl_multi_close($mh);
  return $out;
}
function to_utf8($s) { return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1254'); }
// Cloudflare e-posta koruması: data-cfemail="hex" veya /cdn-cgi/l/email-protection#hex → ilk bayt anahtar, kalanlar XOR
function cfdecode($hex) {
  if (!preg_match('/^[0-9a-f]{4,}$/i', $hex)) return '';
  $k = hexdec(substr($hex, 0, 2)); $o = '';
  for ($i = 2; $i < strlen($hex); $i += 2) $o .= chr(hexdec(substr($hex, $i, 2)) ^ $k);
  return $o;
}
function mails($t) {
  if (preg_match_all('/(?:data-cfemail=["\']|email-protection#)([0-9a-fA-F]{4,})/', $t, $cm)) foreach ($cm[1] as $hx) $t .= ' ' . cfdecode($hx) . ' ';
  $t = str_ireplace(['[at]', '(at)', ' at '], '@', html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
  preg_match_all('/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/', $t, $m);
  $r = [];
  foreach ($m[0] as $e) {
    $e = strtolower(trim($e, '.'));
    if (preg_match('/\.(png|jpe?g|gif|webp|svg)$/', $e) || strpos($e, 'example') !== false) continue;
    if (!in_array($e, $r, true)) $r[] = $e;
  }
  return $r;
}
function phones($t) {
  preg_match_all('/\(?0?\s?\(?232\)?[\s\-.]?\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/', html_entity_decode($t), $m);
  $r = [];
  foreach ($m[0] as $p) { $d = substr(preg_replace('/\D/', '', $p), -10); if (strlen($d) == 10 && !in_array($d, $r, true)) $r[] = $d; }
  return $r;
}

// 1) Ana sayfalar
$home = fetch_all($urls);
// 2) İletişim sayfaları (MEB okul sitesi şablonu + sayfadaki iletişim bağlantıları)
$second = []; $map = [];
foreach ($home as $i => $h) {
  if ($h['kod'] < 200 || $h['kod'] >= 400 || $h['html'] === '') continue;
  $base = $h['url'];
  $cands = ['tema/iletisim.php'];
  if (preg_match_all('/href=["\']([^"\']*(?:iletisim|iletişim|contact)[^"\']*)["\']/iu', $h['html'], $m)) $cands = array_merge($cands, array_slice($m[1], 0, 2));
  foreach (array_unique($cands) as $c) {
    $abs = preg_match('#^https?://#i', $c) ? $c : rtrim(preg_replace('#[^/]*$#', '', $base), '/') . '/' . ltrim($c, '/');
    $host = strtolower((string)parse_url($abs, PHP_URL_HOST));
    if (substr($host, -11) !== '.meb.k12.tr') continue;
    $k = count($second); $second[$k] = $abs; $map[$k] = $i;
  }
}
$cont = $second ? fetch_all($second) : [];
$res = [];
foreach ($urls as $i => $u) {
  $h = $home[$i];
  $pages = [];
  if ($h['kod'] >= 200 && $h['kod'] < 400 && $h['html'] !== '') $pages[] = [$h['url'], to_utf8($h['html'])];
  foreach ($map as $k => $j) if ($j === $i && isset($cont[$k]) && $cont[$k]['kod'] >= 200 && $cont[$k]['kod'] < 400) $pages[] = [$cont[$k]['url'], to_utf8($cont[$k]['html'])];
  $all = []; $src = ''; $tel = [];
  foreach ($pages as [$pu, $tx]) {
    foreach (mails($tx) as $e) if (!in_array($e, $all, true)) { $all[] = $e; if ($src === '') $src = $pu; }
    foreach (phones($tx) as $p) if (!in_array($p, $tel, true)) $tel[] = $p;
  }
  $okul = array_values(array_filter($all, function ($e) { return substr($e, -10) === 'meb.k12.tr'; }));
  $dig = array_values(array_filter($all, function ($e) { return substr($e, -10) !== 'meb.gov.tr'; }));
  $best = $okul[0] ?? ($dig[0] ?? '');
  $ornek = '';
  if (!$best && !empty($in['debug']) && $pages) {
    $tx = strip_tags(end($pages)[1]); $pz = mb_stripos($tx, 'posta'); if ($pz === false) $pz = mb_stripos($tx, 'mail');
    $ornek = $pz === false ? mb_substr(preg_replace('/\s+/', ' ', $tx), 0, 300) : mb_substr(preg_replace('/\s+/', ' ', mb_substr($tx, max(0, $pz - 150), 400)), 0, 300);
    $raw = implode(' ', array_map(function ($p) { return $p[1]; }, $pages)); $rp = mb_stripos($raw, 'Gönder'); if ($rp !== false) $rp = strlen(mb_substr($raw, 0, $rp)); $ornek .= ' ||HTML: ' . ($rp === false ? '' : preg_replace('/\s+/', ' ', mb_strcut($raw, max(0, $rp - 700), 1000))) . ' ||SAYFALAR: ' . implode(' , ', array_map(function ($p) { return $p[0]; }, $pages));
  }
  $res[] = ['ornek' => $ornek, 'web' => $u, 'eposta' => $best, 'tum' => implode(';', array_slice($all, 0, 5)), 'kaynak' => $src,
    'durum' => !$pages ? 'Site açılmadı (HTTP ' . $h['kod'] . ')' : ($best ? 'Bulundu' : 'E-posta yayımlanmamış'), 'telefon' => implode(';', array_slice($tel, 0, 2))];
}
echo json_encode(['sonuc' => $res], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
