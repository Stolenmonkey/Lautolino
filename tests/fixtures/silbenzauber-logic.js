/*LOGIC*/
"use strict";
// ---------- Regeln für deutsche Lesesilben (erweiterbar) ----------
var RULES = {
  vowels: "aeiouäöüy",
  diphthongs: ["au","eu","äu","ei","ie","ai"],        // VV, die als ein Laut gelesen werden
  hiatus: ["ea","eo","ia","io"],                      // Namen-/Wortendungen wie LEO, LEA, MIA
  onsetClusters: ["bl","br","dr","fl","fr","gl","gr","kl","kr","pl","pr","tr","st","sp","qu"],
  codaClusters: ["ch","ck","st","nt","nd","nk","ng","lt","ld","rt","rn","mp","ft",
    "ls","lm","lk","lb","lp","lf","rs","rb","rd","rg","rk","rm","rl","rf","rp","ms","ns","ps","ts","ks","fs","bs","ds","gs"],
  noOnset: "cqß",   // Buchstaben, die allein nicht am Silbenanfang stehen (c nur in ch/ck, q nur in qu, ß nie)
  noCoda: "cq"
};
function isV(c){ return RULES.vowels.indexOf(c) >= 0; }
function okOnset(c){ return !isV(c) && RULES.noOnset.indexOf(c) < 0; }
function okCoda(c){ return !isV(c) && RULES.noCoda.indexOf(c) < 0; }
function okVV(p){ return RULES.diphthongs.indexOf(p) >= 0 || RULES.hiatus.indexOf(p) >= 0; }
function okDiph(p){ return RULES.diphthongs.indexOf(p) >= 0; }

// Prüft, ob eine (kleingeschriebene) Silbe gültig ist
function isValid(s){
  s = s.toLowerCase();
  var a = s[0], b = s[1], c = s[2], i;
  for (i = 1; i < s.length; i++) if (s[i] === s[i-1]) return false;  // keine Doppelungen wie EE, OO, LL
  if (s.length === 2){
    if (isV(a) && isV(b)) return okDiph(s);
    if (isV(a) && !isV(b)) return okCoda(b);
    if (!isV(a) && isV(b)) return okOnset(a);
    return false;
  }
  if (s.length === 3){
    var v = [isV(a), isV(b), isV(c)].map(Number).join("");
    if (v === "010") return okOnset(a) && okCoda(c);                 // CVC  (Lol, Mus)
    if (v === "101") return okCoda(b) || b === "ß";                  // VCV  (Ole, Elo)
    if (v === "011") return okOnset(a) && okVV(b + c);               // CVV  (Leo, Lau)
    if (v === "110") return okDiph(a + b) && okCoda(c);              // VVC  (Aus, Ein)
    if (v === "001") return RULES.onsetClusters.indexOf(a + b) >= 0; // CCV  (Blu, Tra)
    if (v === "100") return RULES.codaClusters.indexOf(b + c) >= 0;  // VCC  (Alt, Ach)
  }
  if (s.length === 4){
    var d = s[3], w = [isV(a), isV(b), isV(c), isV(d)].map(Number).join("");
    if (w === "0101") return okOnset(a) && okCoda(c);                                  // KVKV (Lola, Nase)
    if (w === "1010") return okCoda(b) && okCoda(d);                                   // VKVK (Olel, Esel)
    if (w === "0100") return okOnset(a) && RULES.codaClusters.indexOf(c + d) >= 0;     // KVKK (Land, Lust)
    if (w === "0010") return RULES.onsetClusters.indexOf(a + b) >= 0 && okCoda(d);     // KKVK (Blut, Brot)
    if (w === "0011") return RULES.onsetClusters.indexOf(a + b) >= 0 && okVV(c + d);   // KKVV (Blau, Brei)
    if (w === "0110") return okOnset(a) && okVV(b + c) && okCoda(d);                   // KVVK (Laut, Lieb)
    if (w === "1001") return RULES.codaClusters.indexOf(b + c) >= 0;                   // VKKV (Ante, Olte)
  }
  return false;
}

// Normalisiert die Eingabe: nur Buchstaben, klein, ohne Duplikate
function parseLetters(str){
  var out = [], m = (str || "").toLowerCase().match(/[a-z]/g) || [];
  m.forEach(function(ch){ if (out.indexOf(ch) < 0) out.push(ch); });
  return out;
}
// Erzeugt zuerst die Liste ALLER gültigen Silben der gewünschten Länge
function buildSyllables(letters, len, limit){   // limit: optionaler Abbruch (schnelle Prüfung)
  var res = [];
  (function rec(prefix){
    if (limit && res.length >= limit) return;
    if (prefix.length === len){ if (isValid(prefix)) res.push(prefix); return; }
    letters.forEach(function(l){ if (prefix.length && prefix[prefix.length-1] === l) return; rec(prefix + l); });
  })("");
  return res;
}
// Zählt gültige Silben für die gewählten Längen (bricht bei limit ab)
function countSyllables(letters, lens, limit){
  var n = 0; lens.forEach(function(L){ if (n < limit) n += buildSyllables(letters, L, limit - n).length; });
  return n;
}
function shuffle(arr){
  var a = arr.slice(), i, j, t;
  for (i = a.length - 1; i > 0; i--){ j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
// Genau n Aufgaben. Jede gewählte Silbenlänge hat insgesamt gleiches Gewicht.
// factor 0..100: je weiter hinten ein Buchstabe in der Eingabe steht, desto häufiger kommen Silben mit ihm vor.
// 0 = rein zufällig, 100 = der letzte Buchstabe steckt in jeder Silbe.
// Gewichte je Silbenlänge. bal 0..100: 0 = nur die kürzeste Länge, 100 = nur die längste, 50 = alle gleich oft.
function lenWeights(lens, bal){
  var ls = lens.slice().sort(function(a, b){ return a - b; }), n = ls.length, t = Math.min(100, Math.max(0, bal == null ? 50 : bal)) / 100, w = {}, u, i;
  ls.forEach(function(L, i){
    var uni = 1 / n, ext = (t < 0.5) ? (i === 0 ? 1 : 0) : (i === n - 1 ? 1 : 0);
    u = t < 0.5 ? (0.5 - t) * 2 : (t - 0.5) * 2;     // Abstand von der Mitte: 0 = gleich verteilt, 1 = nur ein Ende
    w[L] = n === 1 ? 1 : (1 - u) * uni + u * ext;
  });
  return w;
}
// Alle Silben mit Gewicht für die aktuelle Einstellung (Aufgabenauswahl und Wahrscheinlichkeitsanzeige nutzen dasselbe)
function buildItems(letters, lens, factor, bal, sylAvg, sbal, blocked){
  var lw = lenWeights(lens, bal);
  var items = [], f = Math.min(100, Math.max(0, factor)) / 100, k = letters.length, last = letters[k - 1];
  lens.forEach(function(L){
    var list = buildSyllables(letters, L);
    list.forEach(function(sy){
      var q = 0; sy.split("").forEach(function(c){ q = Math.max(q, k > 1 ? letters.indexOf(c) / (k - 1) : 1); });
      items.push({ s: sy, lw: lw[L], has: sy.indexOf(last) >= 0, w: (lw[L] / list.length) * ((1 - f) + f * Math.pow(q, 1 + 20 * f)) + 1e-9 });
    });
  });
  if (blocked && blocked.length){ var okI = items.filter(function(it){ return blocked.indexOf(it.s) < 0; }); if (okI.length >= 3) items = okI; }   // gesperrte Silben entfallen (wenn genug übrig bleiben)
  if (sylAvg && sbal != null && sbal !== 50){   // Silben-Schwierigkeit nach gemessener Zeit: 0 = leichte (schnelle), 100 = schwere (langsame)
    var known = items.filter(function(it){ return sylAvg[it.s] != null; }).sort(function(x, y){ return sylAvg[x.s] - sylAvg[y.s]; }), rk = {};
    known.forEach(function(it, q){ rk[it.s] = known.length > 1 ? q / (known.length - 1) : 0.5; });
    var tt = sbal / 100, uu = Math.abs(tt - 0.5) * 2;
    items.forEach(function(it){ var r = rk[it.s] != null ? rk[it.s] : 0.5, e = tt > 0.5 ? r : 1 - r; it.w *= (1 - uu) + uu * Math.pow(e, 4) + 1e-9; });
  }
  var act = items.filter(function(i){ return i.lw > 0; }); if (act.length >= 3) items = act;   // Länge mit Gewicht 0 entfällt ganz (wenn genug Silben bleiben)
  if (f >= 1){ var only = items.filter(function(i){ return i.has; }); if (only.length >= 3) items = only; }
  return items;
}
function makeRound(letters, lens, factor, n, bal, sylAvg, sbal, blocked){
  var items = buildItems(letters, lens, factor, bal, sylAvg, sbal, blocked);
  var out = [], cnt = {};
  for (var i = 0; i < n; i++){
    var prev = out[i - 1], cand = items.filter(function(it){ return items.length < 2 || it.s !== prev; }), tot = 0;
    var ws = cand.map(function(it){ var w = it.w / (1 + 2 * (cnt[it.s] || 0)); tot += w; return w; });   // Wiederholungen dämpfen
    var r = Math.random() * tot, j = 0; while (j < cand.length - 1 && r >= ws[j]){ r -= ws[j]; j++; }
    out.push(cand[j].s); cnt[cand[j].s] = (cnt[cand[j].s] || 0) + 1;
  }
  return out;
}
// Wahrscheinlichkeit je Silbe pro Aufgabe (ohne die kleine Wiederholungsdämpfung)
function sylProbs(letters, lens, factor, bal, sylAvg, sbal, blocked){
  var items = buildItems(letters, lens, factor, bal, sylAvg, sbal, blocked), tot = 0, p = {};
  items.forEach(function(it){ tot += it.w; });
  items.forEach(function(it){ p[it.s] = it.w / tot; });
  return p;
}
// Zufällige Schreibweise, unabhängig von der Silbe
// Nur der erste Buchstabe wird zufällig groß oder klein, alle weiteren sind immer klein
function randomCase(s){ return (Math.random() < 0.5 ? s[0].toUpperCase() : s[0].toLowerCase()) + s.slice(1).toLowerCase(); }
// ß bleibt in beiden Schreibweisen ß (toUpperCase würde "SS" liefern)
function fixSz(r, s){ return r.split("").map(function(ch, i){ return s[i] === "ß" ? "ß" : ch; }).join(""); }

// ---------- Kindgerechte Buchstaben: ALLE Buchstaben als eigene SVG-Glyphen ----------
// Einheitliche, runde Strichschrift (wie das kleine l). Höhe 140 Einheiten (1 Einheit = 0,01 em):
// Oberlänge y=8, Großbuchstaben y=12, x-Höhe y=56, Grundlinie y=110, Unterlänge y=134. Strichbreite 12, runde Enden.
// Jeder Eintrag: [Breite, Zeichnung]. a und g sind einstöckig, l hat unten den Hakenbogen.
var P = function(){ return Array.prototype.slice.call(arguments).map(function(d){ return '<path class="s" d="' + d + '"/>'; }).join(""); };
var O = function(cx, cy, r){ return '<circle class="s" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; };
var DOT = function(cx, cy){ return '<circle class="d" cx="' + cx + '" cy="' + cy + '" r="7.5"/>'; };
var GLYPHS = {
  a:[76,O(36,83,27)+P("M63 56V110")], b:[78,P("M12 8V110")+O(39,83,27)], c:[70,P("M56.7 65.6A27 27 0 1 0 56.7 100.4")],
  d:[74,O(34,83,27)+P("M61 8V110")], e:[76,P("M9 83H63A27 27 0 1 0 56.7 100.4")], f:[62,P("M26 110V34Q26 10 50 12","M8 56H46")],
  g:[76,O(36,83,27)+P("M63 56V118Q63 134 38 134Q22 134 14 124")], h:[70,P("M12 8V110","M12 82Q12 56 36 56Q58 56 58 82V110")],
  i:[52,P("M26 56V110")+DOT(26,28)], j:[52,P("M32 56V120Q32 134 14 134")+DOT(32,28)], k:[66,P("M12 8V110","M54 56L14 88","M26 80L56 110")],
  l:[56,P("M16 8V96Q16 110 28 110Q38 110 44 103")],
  m:[100,P("M12 56V110","M12 82Q12 56 32 56Q50 56 50 82V110","M50 82Q50 56 70 56Q88 56 88 82V110")],
  n:[68,P("M12 56V110","M12 82Q12 56 34 56Q56 56 56 82V110")], o:[72,O(36,83,27)], p:[78,P("M12 56V134")+O(39,83,27)],
  q:[76,O(36,83,27)+P("M63 56V134")], r:[56,P("M12 56V110","M12 84Q14 56 42 58")],
  s:[66,P("M52 64Q44 56 34 56Q16 56 16 70Q16 80 34 84Q54 88 54 98Q54 110 34 110Q22 110 14 102")],
  t:[60,P("M28 22V96Q28 110 40 110Q46 110 52 104","M10 56H46")], u:[70,P("M12 56V84Q12 110 36 110Q58 110 58 84","M58 56V110")],
  v:[72,P("M10 56L36 110L62 56")], w:[96,P("M10 56L28 110L48 56L68 110L86 56")], x:[70,P("M12 56L58 110","M58 56L12 110")],
  y:[72,P("M12 56L38 108","M62 56L34 120Q26 134 12 132")], z:[70,P("M14 56H56L14 110H58")],
  A:[72,P("M12 110L36 12L60 110","M22 80H50")], B:[72,P("M12 12V110","M12 12H34Q54 12 54 34Q54 56 34 58H12","M34 58Q60 58 60 84Q60 110 34 110H12")],
  C:[66,P("M58 30Q48 12 36 12Q12 12 12 61Q12 110 36 110Q48 110 58 92")], D:[72,P("M12 12V110H30Q60 110 60 61Q60 12 30 12H12Z")],
  E:[64,P("M54 12H12V110H54","M12 61H46")], F:[62,P("M54 12H12V110","M12 61H46")],
  G:[70,P("M58 30Q48 12 36 12Q12 12 12 61Q12 110 36 110Q60 110 60 80H38")], H:[70,P("M12 12V110","M58 12V110","M12 61H58")],
  I:[40,P("M20 12V110")], J:[56,P("M44 12V90Q44 110 28 110Q16 110 10 100")], K:[68,P("M12 12V110","M56 12L12 70","M28 52L58 110")],
  L:[62,P("M12 12V110H54")], M:[80,P("M12 110V12L40 70L68 12V110")], N:[70,P("M12 110V12L58 110V12")],
  O:[74,P("M37 12A27 49 0 1 0 37 110A27 49 0 1 0 37 12Z")], P:[66,P("M12 110V12H36Q58 12 58 36Q58 60 36 60H12")],
  Q:[76,P("M37 12A27 49 0 1 0 37 110A27 49 0 1 0 37 12Z","M44 90L62 112")],
  R:[68,P("M12 110V12H36Q58 12 58 36Q58 60 36 60H12","M34 60L58 110")],
  S:[68,P("M54 28Q46 12 34 12Q14 12 14 34Q14 54 36 60Q58 66 58 86Q58 110 34 110Q20 110 10 94")],
  T:[68,P("M8 12H60","M34 12V110")], U:[72,P("M12 12V80Q12 110 36 110Q60 110 60 80V12")], V:[72,P("M10 12L36 110L62 12")],
  W:[96,P("M8 12L26 110L48 40L70 110L88 12")], X:[70,P("M12 12L58 110","M58 12L12 110")],
  Y:[72,P("M10 12L36 60L62 12","M36 60V110")], Z:[72,P("M12 12H58L12 110H60")]
};
function renderWord(str){
  return str.split("").map(function(ch){
    var g = GLYPHS[ch];
    if (g) return '<svg viewBox="0 0 ' + g[0] + ' 140" style="width:' + (g[0] / 100) + 'em" aria-hidden="true">' + g[1] + '</svg>';
    return '<span>' + ch + '</span>';
  }).join("");
}
// Zeitangabe für die Abschlussseite
function formatTime(sec){
  if (sec < 60) return String(sec).replace(".", ",") + " Sekunden";
  var m = Math.floor(sec / 60), r = Math.round(sec - m * 60); if (r === 60){ m++; r = 0; }
  return m + " Min. " + r + " Sek.";
}

// ---------- Automatik und Rückmeldung (reine Funktionen) ----------
function avgLast(times, n){
  var a = times.slice(-Math.max(1, n)); if (!a.length) return null;
  return a.reduce(function(x, y){ return x + y; }, 0) / a.length;
}
// Neuer Wert für den Längen-Regler (0..100): langsamer als Ziel -> kürzere Silben (leichter), schneller -> längere (schwerer)
function autoAdjust(bal, times, target, n){
  var avg = avgLast(times, n); if (avg === null || !(target > 0)) return bal;
  var rel = (target - avg) / target;                    // > 0: schneller als das Ziel
  if (Math.abs(rel) < 0.05) return bal;                 // Toleranz ±5 %
  var d = Math.round(Math.max(-15, Math.min(15, rel * 40)) / 5) * 5;
  if (d === 0) d = rel > 0 ? 5 : -5;
  return Math.max(0, Math.min(100, bal + d));
}
// Automatik-Weg: Die Silbenschwierigkeit ist von der Silbenlänge abgeleitet (doppelt so hoch, höchstens 100 %).
// Bis 50 % Länge steigen/sinken beide gemeinsam (20 -> 40, 45 -> 90), ab 50 / 100 bewegt sich nur noch die Länge.
function sdFromLen(len){ return Math.min(100, Math.max(0, Math.round(len * 2))); }
// Rückmeldung nach der Runde im Vergleich zur letzten Runde mit denselben Buchstaben
var FB = {
  fast: ["Du warst schneller als in den letzten Runden!", "Das war schneller als in den letzten Runden!", "Du bist schneller geworden als zuletzt!"],
  praise: ["Glückwunsch!", "Super gemacht!", "Klasse Leistung!", "Toll, weiter so!"],
  slow: ["Du warst langsamer als in den letzten Runden.", "Diesmal ging es etwas langsamer als zuletzt.", "Das war etwas langsamer als in den letzten Runden."],
  cheer: ["Macht nichts, weiter so!", "Gleich nochmal versuchen!", "Übung macht den Meister!", "Du schaffst das!"]
};
function pick(arr, rnd){ return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; }
// prev = Durchschnitt der letzten Runden mit denselben Buchstaben (oder null), cur = Zeit dieser Runde; keine Zeitangabe im Text
function feedback(prev, cur, rnd){
  if (prev === null || prev === undefined) return { kind: "first", text: "Das war deine erste Runde mit diesen Buchstaben. Prima gemacht, weiter so!" };
  if (Math.round(cur * 10) < Math.round(prev * 10)) return { kind: "faster", text: pick(FB.fast, rnd) + " " + pick(FB.praise, rnd) };
  return { kind: "slower", text: pick(FB.slow, rnd) + " " + pick(FB.cheer, rnd) };
}

// ---------- Gespeicherte Buchstaben-Sets (reine Funktionen) ----------
function addSet(sets, letters){
  var key = letters.join(""); if (!key) return sets;
  return [key].concat(sets.filter(function(k){ return k !== key; })).slice(0, 12);
}
function removeSet(sets, key){ return sets.filter(function(k){ return k !== key; }); }

// ---------- Statistik (reine Funktionen) ----------
function comboKey(letters, lens){ return letters.slice().sort().join("") + "|" + lens.slice().sort().join(","); }
// Trägt eine komplett beendete Runde ein (sortierte Buchstaben, neueste Kombination zuerst)
function recordRound(stats, letters, lens, seconds){
  var st = JSON.parse(JSON.stringify(stats)), key = comboKey(letters, lens), c = null;
  st.total += 1;
  st.combos = st.combos.filter(function(x){ if (x.key === key){ c = x; return false; } return true; });
  if (!c) c = { key: key, letters: letters.slice().sort().join(""), order: letters.join(""), lens: lens.slice().sort(), times: [], rounds: 0 };
  c.times.push(seconds); c.times = c.times.slice(-7); c.rounds += 1; c.order = letters.join("");
  st.combos.unshift(c); st.combos = st.combos.slice(0, 40);
  return st;
}
function pv(x){ if (x == null) return undefined; x = Math.round(Number(x)); return isFinite(x) ? Math.max(0, Math.min(100, x)) : undefined; }
// Startwert (Schwierigkeit) für eine Kombination: eigener Wert, sonst ähnlichste bekannte Kombination minus 25, sonst Fallback
function startVal(stats, letters, lens, field, fallback){
  var key = comboKey(letters, lens), me = letters, best = -1, bv = null, own = null, lk = lens.slice().sort().join();
  stats.combos.forEach(function(c){
    if (c.key === key){ own = c; return; }
    if (typeof c[field] !== "number" || c.lens.slice().sort().join() !== lk) return;
    var cl = c.letters.split(""), inter = cl.filter(function(x){ return me.indexOf(x) >= 0; }).length, sim = inter / (cl.length + me.length - inter);
    if (inter > 0 && sim > best){ best = sim; bv = c[field]; }
  });
  if (own) return typeof own[field] === "number" ? own[field] : fallback;
  return bv === null ? fallback : Math.max(0, bv - 25);
}
// Zeit pro Silbe: je Silbe die letzten 10 Zeiten (Sekunden bis „Weiter“, höchstens 30)
function recordSyl(syl, s, sec){ var k = s.toLowerCase(); syl[k] = (syl[k] || []).concat([Math.max(0, Math.min(30, sec))]).slice(-12); return syl; }
// Zeit je Silbe: letzte 12 Zeiten, die 2 längsten werden gestrichen (bei wenigen Zeiten weniger; mindestens 3 bleiben)
function sylStat(times){
  var a = (times || []).slice(-12), n = a.length;
  if (!n) return { avg: null, times: a, dropped: [] };
  var drop = Math.min(2, Math.max(0, n - 3)), sum = 0, c = 0;
  var order = a.map(function(v, i){ return i; }).sort(function(x, y){ return a[y] - a[x] || y - x; }), dr = order.slice(0, drop);
  a.forEach(function(v, i){ if (dr.indexOf(i) < 0){ sum += v; c++; } });
  return { avg: sum / c, times: a, dropped: dr };
}
function sanitizeSyl(o){
  var out = {}, n = 0;
  if (o && typeof o === "object") Object.keys(o).forEach(function(k){
    var key = String(k).toLowerCase(), t = (Array.isArray(o[k]) ? o[k] : []).map(Number).filter(function(x){ return isFinite(x) && x >= 0; }).map(function(x){ return Math.min(30, x); }).slice(-12);
    if (/^[a-z]{2,4}$/.test(key) && t.length && n < 600){ out[key] = t; n++; }
  });
  return out;
}
// Gesperrte Silben gelten für alle Buchstabenkombinationen (Liste). Alte Speicherstände (je Kombination) werden zusammengeführt.
function sanitizeBlocked(o){
  var src = [], seen = {}, out = [];
  if (Array.isArray(o)) src = o;
  else if (o && typeof o === "object") Object.keys(o).forEach(function(k){ if (Array.isArray(o[k])) src = src.concat(o[k]); });
  src.forEach(function(x){ var q = String(x).toLowerCase(); if (/^[a-z]{2,4}$/.test(q) && !seen[q] && out.length < 600){ seen[q] = 1; out.push(q); } });
  return out;
}
// Gespeicherte Statistik prüfen und bereinigen
function sanitizeStats(o){
  var st = { total: 0, combos: [] };
  if (o && typeof o === "object"){
    st.total = Math.max(0, Math.floor(Number(o.total) || 0));
    (Array.isArray(o.combos) ? o.combos : []).forEach(function(c){
      if (!c || typeof c.key !== "string") return;
      var times = (Array.isArray(c.times) ? c.times : []).map(Number).filter(function(x){ return isFinite(x) && x >= 0; }).slice(-7);
      var lens = (Array.isArray(c.lens) ? c.lens : []).map(Number).filter(function(x){ return x >= 2 && x <= 4; });
      var le = parseLetters(String(c.letters || "")).join("");
      if (!le || !lens.length) return;
      var od = parseLetters(String(c.order || "")).join(""); if (od.split("").sort().join("") !== le.split("").sort().join("")) od = le;
      st.combos.push({ key: c.key, letters: le, order: od, lens: lens, times: times, rounds: Math.max(times.length, Math.floor(Number(c.rounds) || 0)), bal: pv(c.bal), sd: pv(c.sd) });
    });
    st.combos = st.combos.slice(0, 40);
  }
  return st;
}
// Liniendiagramm: Y = Sekunden. Rollierend: immer nur die letzten 7 Runden. Kommt Runde 8 dazu, fällt Runde 1 heraus. Orange gestrichelte Linie = Durchschnitt.
function chartSvg(times, rounds){
  var shown = Math.min(7, times.length), arr = times.slice(-shown), start = rounds - shown + 1, N = 7;
  var mx = Math.max.apply(null, arr.concat([1])), steps = [10,20,30,40,60,90,120,180,240,300,600,1200,1800,3600];
  var top = steps.filter(function(x){ return x >= mx * 1.05; })[0] || Math.ceil(mx * 1.05 / 600) * 600;
  var W = 320, H = 190, L = 46, R = 12, T = 16, B = 36, pw = W - L - R, ph = H - T - B, sw = pw / N, pts = [];
  var o = '<svg class="chart" viewBox="0 0 320 190" role="img" aria-label="Zeit pro Runde in Sekunden">';
  [0, 0.5, 1].forEach(function(f){
    var y = T + ph - ph * f;
    o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#d6e3f3" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#4b5b7a">' + Math.round(top * f) + '</text>';
  });
  for (var i = 0; i < N; i++){
    var x = L + (i + 0.5) * sw;
    if (i < shown) o += '<text x="' + x.toFixed(1) + '" y="' + (T + ph + 14) + '" text-anchor="middle" font-size="10" fill="#4b5b7a">' + (start + i) + '</text>';
  }
  arr.forEach(function(v, i){ pts.push([L + (i + 0.5) * sw, T + ph - ph * v / top, v]); });
  pts.forEach(function(q){
    o += '<rect class="pt" x="' + (q[0] - sw * 0.31).toFixed(1) + '" y="' + q[1].toFixed(1) + '" width="' + (sw * 0.62).toFixed(1) + '" height="' + Math.max(1, T + ph - q[1]).toFixed(1) + '" rx="4" fill="#2f7fd8"/>';
    o += '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] - 4).toFixed(1) + '" text-anchor="middle" font-size="9" fill="#1f2a44">' + Math.round(q[2]) + '</text>';
  });
  o += '<text x="' + (L + pw / 2) + '" y="' + (H - 3) + '" text-anchor="middle" font-size="11" fill="#4b5b7a">Runde</text>';
  o += '<text transform="translate(11 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle" font-size="11" fill="#4b5b7a">Sekunden</text></svg>';
  return o;
}

// ---------- Sprachausgabe: Status (reine Funktion) ----------
function speechInfo(supported, voices){
  if (!supported) return { kind: "unsupported", text: "Dieser Browser kann nicht vorlesen. Der Lautsprecher-Button wird nicht angezeigt." };
  var de = (voices || []).filter(function(v){ return /^de/i.test(v.lang || ""); });
  if (de.length) return { kind: "ok", text: "Deutsche Stimme gefunden: " + de[0].name + ". Das Vorlesen klingt richtig." };
  if (!voices || !voices.length) return { kind: "unknown", text: "Es wurden noch keine Stimmen erkannt. Tippe auf „Neu prüfen“." };
  return { kind: "none", text: "Keine deutsche Stimme installiert. Das Vorlesen klingt dann falsch (englische Aussprache). Die Anleitung zeigt, wie man sie installiert." };
}

// ---------- Vorlesen: Silbe für die Sprachausgabe aufbereiten ----------
// Ganze Silben wie "one" erkennt die Sprachausgabe als englisches Wort. Deshalb wird in Sprechsilben getrennt
// (o | ne), die einzeln deutsch gesprochen werden. Regeln: Hiatus (le|o), ein Konsonant geht zur 2. Silbe (o|ne),
// Anlaut-Cluster bleiben zusammen (a|bra), sonst wird zwischen den Konsonanten getrennt (an|te).
function germanSplit(s){
  s = s.toLowerCase();
  var vs = [], m, re = /[aeiouy]+/g;
  while ((m = re.exec(s)) !== null) vs.push({ a: m.index, b: m.index + m[0].length });
  if (vs.length < 2) {
    var g = vs[0];
    if (g && g.b - g.a === 2 && RULES.hiatus.indexOf(s.slice(g.a, g.b)) >= 0) return [s.slice(0, g.a + 1), s.slice(g.a + 1)];
    return [s];
  }
  var cons = s.slice(vs[0].b, vs[1].a), cut;
  if (cons.length === 0) cut = vs[0].b;
  else if (cons.length === 1 || RULES.onsetClusters.indexOf(cons) >= 0) cut = vs[0].b;
  else cut = vs[0].b + 1;
  return [s.slice(0, cut), s.slice(cut)];
}
// Bekannte Problemfälle: Die Stimme liest sie sonst als Abkürzung/Zeichen/Fremdwort (tel = Telefon, at = @ ...)
var DEFAULT_FIXES = { tel: "tell", at: "att", ok: "ock", ex: "ecks", hi: "hie" };
function ttsText(s, fixes){
  var key = s.toLowerCase();
  if (fixes && Object.prototype.hasOwnProperty.call(fixes, key)) return fixes[key];
  return germanSplit(s).join(" ");
}
// Eigene Korrekturen prüfen und bereinigen
function sanitizeFixes(o){
  var out = {}, n = 0;
  if (o && typeof o === "object") Object.keys(o).forEach(function(k){
    var key = String(k).toLowerCase().replace(/[^a-z]/g, ""), v = String(o[k]).trim().toLowerCase().slice(0, 20);
    if (key && key.length <= 4 && /^[a-zäöüß ]+$/.test(v) && n < 30){ out[key] = v; n++; }
  });
  return out;
}

// ---------- Automatisierte Tests ----------
function runTests(){
  var r = [], ok = function(n, c){ r.push((c ? "OK   " : "FAIL ") + n); };
  var L = ["o","l","e"], two = buildSyllables(L, 2), three = buildSyllables(L, 3);
  ["ol","lo","el","le"].forEach(function(s){ ok("2er enthält " + s, two.indexOf(s) >= 0); });
  ["elo","ole","leo"].forEach(function(s){ ok("3er enthält " + s, three.indexOf(s) >= 0); });
  ["ee","oo","loo","ll","aaaa","mlaa"].forEach(function(s){ ok("ungültig: " + s, !isValid(s)); });
  ["mala","land","blau","laut","ante","olel"].forEach(function(s){ ok("4er gültig: " + s, isValid(s)); });
  ok("Längen stimmen", two.every(function(s){ return s.length === 2; }) && three.every(function(s){ return s.length === 3; }));
  ok("Umlaute und ß werden entfernt", parseLetters("ä ö ü ß a").join("") === "a");
  ok("Eingabe 'O, L, e, o' -> o,l,e", parseLetters("O, L, e, o").join("") === "ole");
  ok("countSyllables bricht bei limit ab", countSyllables(L, [2,3], 3) === 3);
  var rd = makeRound(L, [2,3], 0, 20); ok("Runde hat exakt 20 Aufgaben", rd.length === 20);
  var rep = false; rd.forEach(function(s, i){ if (i && s === rd[i-1]) rep = true; }); ok("keine direkten Wiederholungen", !rep);
  var sm = makeRound(["a","l"], [2,3], 0, 20); rep = false;
  sm.forEach(function(s, i){ if (i && s === sm[i-1]) rep = true; }); ok("kleiner Pool: 20 Aufgaben, keine direkten Wiederholungen", sm.length === 20 && !rep);
  var M = ["l","o","e","m"], r100 = makeRound(M, [2,3,4], 100, 20);
  ok("Faktor 100: letzter Buchstabe in jeder Silbe", r100.length === 20 && r100.every(function(x){ return x.indexOf("m") >= 0; }));
  var n0 = 0, n80 = 0; for (var t = 0; t < 80; t++){ makeRound(M, [3], 0, 20).forEach(function(x){ if (x.indexOf("m") >= 0) n0++; }); makeRound(M, [3], 80, 20).forEach(function(x){ if (x.indexOf("m") >= 0) n80++; }); }
  ok("Faktor 80 nutzt 'm' deutlich häufiger als Faktor 0", n80 > n0 * 1.15);
  var wb = lenWeights([2,3], 50), w0 = lenWeights([2,3], 0), w1 = lenWeights([2,3], 100), w3 = lenWeights([3,4,2], 50), w30 = lenWeights([2,3,4], 0), w3e = lenWeights([2,3,4], 100);
  ok("Längen-Verteilung: 50 % = gleich, 0 % = nur kurz, 100 % = nur lang", wb[2] === 0.5 && wb[3] === 0.5 && w0[2] === 1 && w0[3] === 0 && w1[2] === 0 && w1[3] === 1);
  ok("Längen-Verteilung bei 3 Längen: 50 % gleich, 0 % nur 2, 100 % nur 4", Math.abs(w3[2] - 1/3) < 1e-9 && Math.abs(w3[4] - 1/3) < 1e-9 && w30[2] === 1 && w30[3] === 0 && w3e[4] === 1 && w3e[2] === 0);
  ok("Runde bei 0 % nur 2er, bei 100 % nur 3er", makeRound(M, [2,3], 0, 20, 0).every(function(x){ return x.length === 2; }) && makeRound(M, [2,3], 0, 20, 100).every(function(x){ return x.length === 3; }));
  var lens = {}; makeRound(M, [2,3,4], 0, 20).forEach(function(x){ lens[x.length] = 1; }); 
  var seen = {}; for (var i = 0; i < 200; i++) seen[randomCase("eLO")] = 1;
  ok("Nur der Anfangsbuchstabe variiert (Elo/elo), Rest klein", Object.keys(seen).sort().join() === "Elo,elo");
  var s1 = recordRound({ total: 0, combos: [] }, ["l","o","e"], [3,2], 12.3); s1 = recordRound(s1, ["e","o","l"], [2,3], 10);
  ok("Statistik: gleiche Auswahl = eine Kombination, 2 Runden", s1.combos.length === 1 && s1.combos[0].times.length === 2 && s1.total === 2 && s1.combos[0].rounds === 2);
  var s2 = recordRound(s1, ["a"], [2], 5);
  ok("Statistik: neue Kombination steht vorn", s2.combos.length === 2 && s2.combos[0].letters === "a" && s2.total === 3);
  ok("Statistik: Bereinigung verwirft kaputte Daten", sanitizeStats({ total: "x", combos: [{ key: 5 }] }).combos.length === 0);
  ok("Diagramm: ein Punkt je Runde, Achse zeigt 1 bis 3", (chartSvg([5,8,12], 3).match(/class="pt"/g) || []).length === 3 && chartSvg([5,8,12], 3).indexOf(">3<") > 0);
  var big = function(n){ var a = []; for (var q = 0; q < n; q++) a.push(100); return a; }, c12 = chartSvg(big(12), 12);
  ok("Diagramm: höchstens 7 Punkte, Achse rollt (Runde 12 -> 6 bis 12)", (c12.match(/class="pt"/g) || []).length === 7 && c12.indexOf(">12<") > 0 && c12.indexOf(">6<") > 0 && c12.indexOf(">5<") < 0);
  var roll = { total: 0, combos: [] }; for (var z = 1; z <= 12; z++) roll = recordRound(roll, ["a"], [2], z);
  ok("Statistik: nur die letzten 7 Zeiten bleiben (Runde 8 streicht Runde 1)", roll.combos[0].times.length === 7 && roll.combos[0].times[0] === 6 && roll.combos[0].rounds === 12);
  ok("Durchschnitt der letzten n Zeiten", avgLast([10, 20, 30, 40], 3) === 30 && avgLast([10, 20], 7) === 15 && avgLast([], 3) === null);
  ok("Automatik: langsamer -> leichter, schneller -> schwerer, im Ziel -> gleich", autoAdjust(50, [80, 80, 80], 60, 3) < 50 && autoAdjust(50, [40, 40, 40], 60, 3) > 50 && autoAdjust(50, [60, 61, 59], 60, 3) === 50);
  ok("Automatik: nur die letzten n Runden zählen, Grenzen 0 und 100", autoAdjust(50, [200, 200, 40, 40, 40], 60, 3) === 65 && autoAdjust(0, [100], 60, 3) === 0 && autoAdjust(100, [10], 60, 3) === 100);
  ok("Rückmeldung: schneller / langsamer / erste Runde, ohne Zeitangabe", feedback(50, 45.8).kind === "faster" && feedback(50, 45.8).text.indexOf("Sekunden") < 0 && feedback(40, 43).kind === "slower" && feedback(40, 40).kind === "slower" && feedback(null, 40).kind === "first");
  var abc = "abcdefghijklmnopqrstuvwxyz"; 
  ok("alle 52 Buchstaben sind eigene SVG-Glyphen", (abc + abc.toUpperCase()).split("").every(function(c){ return renderWord(c).indexOf("<svg") === 0; }));
  ok("Silbe 'Elo' besteht aus 3 SVG-Glyphen", (renderWord("Elo").match(/<svg/g) || []).length === 3);
  ok("Zeitformat", formatTime(42.3) === "42,3 Sekunden" && formatTime(83.4) === "1 Min. 23 Sek.");
  var st = addSet(addSet([], ["o","l"]), ["a","m"]); st = addSet(st, ["o","l"]);
  ok("Sets: ohne Duplikate, neuestes zuerst", st.join() === "ol,am");
  ok("Sets: löschen funktioniert", removeSet(st, "ol").join() === "am");
  ok("Sprachstatus: nicht unterstützt", speechInfo(false, []).kind === "unsupported");
  ok("Sprachstatus: deutsche Stimme (auch de_DE)", speechInfo(true, [{ lang: "en-US", name: "A" }, { lang: "de_DE", name: "Anna" }]).kind === "ok");
  ok("Sprachstatus: nur Englisch -> keine deutsche Stimme", speechInfo(true, [{ lang: "en-US", name: "A" }]).kind === "none");
  ok("Sprachstatus: keine Stimmen geladen -> unbekannt", speechInfo(true, []).kind === "unknown");
  ok("Vorlesen: one -> o ne, ole -> o le, elo -> e lo", germanSplit("one").join("|") === "o|ne" && germanSplit("ole").join("|") === "o|le" && germanSplit("elo").join("|") === "e|lo");
  ok("Vorlesen: Hiatus leo -> le o, Diphthong lau bleibt ganz", germanSplit("leo").join("|") === "le|o" && germanSplit("lau").join("|") === "lau");
  ok("Vorlesen: ante -> an te, nase -> na se, blau/land/ol bleiben ganz", germanSplit("ante").join("|") === "an|te" && germanSplit("nase").join("|") === "na|se" && germanSplit("blau").length === 1 && germanSplit("land").length === 1 && germanSplit("ol").length === 1);
  ok("Vorlesen: Text mit Leerzeichen getrennt", ttsText("One") === "o ne");
  ok("Vorlesen: TEL -> tell, AT -> att (eingebaute Korrekturen)", ttsText("TEL", DEFAULT_FIXES) === "tell" && ttsText("At", DEFAULT_FIXES) === "att");
  ok("Vorlesen: Silben ohne Korrektur werden getrennt (One -> o ne)", ttsText("One", DEFAULT_FIXES) === "o ne");
  ok("Vorlesen: eigene Korrektur hat Vorrang", ttsText("tel", { tel: "tel le" }) === "tel le");
  ok("Korrekturen: Bereinigung", JSON.stringify(sanitizeFixes({ "TEL": " Tell ", "x1": "<b>", "abcde": "ok", "": "a" })) === '{"tel":"tell"}');
  var sv = { total: 1, combos: [{ key: comboKey(["o","l","e"], [2,3]), letters: "elo", lens: [2,3], times: [10], rounds: 1, bal: 60, sd: 40 }] };
  ok("Start-Schwierigkeit: eigene Kombination, ähnliche -25, sonst Fallback", startVal(sv, ["o","l","e"], [2,3], "bal", 50) === 60 && startVal(sv, ["o","l","e","m"], [2,3], "bal", 50) === 35 && startVal(sv, ["a","b"], [2,3], "bal", 50) === 50);
  var sl = {}; for (var y = 0; y < 14; y++) recordSyl(sl, "Ola", y);
  ok("Silbenzeit: nur letzte 12, höchstens 30 s, Bereinigung", sl.ola.length === 12 && sl.ola[0] === 2 && recordSyl({}, "a", 99).a[0] === 30 && Object.keys(sanitizeSyl({ ola: [1, "x"], "Bad1": [1] })).join() === "ola");
  var allS = buildSyllables(M, 2).concat(buildSyllables(M, 3)), av = {}; allS.forEach(function(q, i){ av[q] = i + 1; });
  var mt = function(sb){ var tt = 0, cc = 0; for (var q = 0; q < 20; q++) makeRound(M, [2,3], 0, 20, 50, av, sb).forEach(function(x){ tt += av[x]; cc++; }); return tt / cc; };
  ok("Silben-Schwierigkeit: 100 % wählt langsamere Silben als 0 %", mt(100) > mt(0) + 3);
  ok("Automatik-Weg: Silben = doppelte Länge, höchstens 100 %", sdFromLen(20) === 40 && sdFromLen(50) === 100 && sdFromLen(80) === 100 && sdFromLen(45) === 90);
  ok("Sperren: gesperrte Silben kommen nicht vor, Bereinigung", makeRound(M, [2,3], 0, 20, 50, null, 50, ["ol","lo"]).every(function(x){ return x !== "ol" && x !== "lo"; }) && JSON.stringify(sanitizeBlocked({ elo: ["Ol","ol","x"], Ole: ["ab"] })) === '["ol","ab"]');
  ok("Doppelungen bleiben verboten (ee, oo, ll, all, alle, ball); als ist gültig", ["als","ols","lol","lel"].every(isValid) && !["ee","oo","ll","loo","all","alle","ell","ball","aale"].some(isValid));
  ok("Silben mit Wiederholung (lol, lel) bleiben in der Silbenstatistik", Object.keys(sanitizeSyl({ lol: [1.5], lel: [2], "Bad1": [1] })).join() === "lol,lel" && sanitizeFixes({ all: "al" }).all === "al");
  var tt1 = sylStat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  ok("Silbenzeit: letzte 12, die 2 längsten gestrichen", tt1.times.length === 12 && tt1.dropped.length === 2 && Math.abs(tt1.avg - 6.5) < 1e-9 && sylStat([5, 9, 7]).dropped.length === 0 && sylStat([5, 9, 7, 1]).dropped.length === 1 && sylStat([]).avg === null);
  var pr = sylProbs(M, [2,3], 0, 50, null, 50, ["ol"]), ps = 0; Object.keys(pr).forEach(function(q){ ps += pr[q]; });
  ok("Wahrscheinlichkeiten: Summe 100 %, gesperrte Silbe fehlt", Math.abs(ps - 1) < 1e-9 && pr.ol === undefined && pr.lo > 0);
  ok("Sperren global als Liste", JSON.stringify(sanitizeBlocked(["Ol", "ol", "x"])) === '["ol"]');
  return r;
}


