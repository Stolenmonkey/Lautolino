# Erzeugt packages/core/src/wortschreibung.ts: Groß-/Kleinschreibung der echten Übungswörter (Wörter aus WOERTER_ZIPF).
# Quellen: Python-Pakete german-nouns (Substantivliste, Wiktionary, CC BY-SA) und HanTa (Wortart-Tagger, Lizenz GPL/Apache siehe Paket).
# Aufruf (im Repo-Hauptordner): pip install german-nouns HanTa && python3 tools/silbenfreq/export_case.py
# Regel: nur Substantiv/Name -> groß; nur anderes (Verb, Adjektiv, Funktionswort ...) -> klein; beides oder unbekannt -> nicht in der Tabelle (Zufall 50/50).
import re
from german_nouns.lookup import Nouns
from HanTa import HanoverTagger as ht

src = open("packages/core/src/silbenfreq.ts", encoding="utf-8").read()
m = re.search(r'WOERTER_ZIPF[^=]*=\s*/\*[^*]*\*/\s*parse\("([^"]*)"\)', src)
words = [e.split(":")[0] for e in m.group(1).split(",")]

nn = Nouns()
noun_forms = set()
for row in nn.data:
    pass
# Grundformen: Nominativ Singular und Plural (keine Dativ-Plural-Formen wie "Malen", sonst wäre jedes Verb mehrdeutig).
for w in set(x.capitalize() for x in words):
    for e in nn[w] or []:
        fl = e["flexion"]
        if w in (v for k, v in fl.items() if k.startswith("nominativ")):
            noun_forms.add(w.lower())
            break

t = ht.HanoverTagger("morphmodel_ger.pgz")
NOUNISH = {"NN", "NE", "NNI", "NNA", "FM"}
UNKNOWN = {"XY"}
gross, klein = [], []
for w in words:
    top = t.tag_word(w, cutoff=3)[0][0]
    tagn = re.sub(r"\(.*\)", "", top)
    other = tagn not in NOUNISH and tagn not in UNKNOWN
    noun = w in noun_forms or tagn in {"NE", "NN", "FM"}
    if noun and not other:
        gross.append(w)
    elif other and not noun:
        klein.append(w)
out = ["// GENERIERT von tools/silbenfreq/export_case.py – nicht von Hand ändern.",
       "// Quellen: german-nouns (Wiktionary, CC BY-SA 4.0) und HanTa. Echte Übungswörter mit eindeutiger Schreibweise; mehrdeutige/unbekannte Wörter fehlen (dort Zufall 50/50).",
       "// GROSS = Substantive und Namen, KLEIN = alle anderen Wörter.",
       f'const set = (s: string): Set<string> => new Set(s.split(","));',
       f'export const WORT_GROSS: Set<string> = /* @__PURE__ */ set("{",".join(sorted(gross))}");',
       f'export const WORT_KLEIN: Set<string> = /* @__PURE__ */ set("{",".join(sorted(klein))}");', ""]
open("packages/core/src/wortschreibung.ts", "w", encoding="utf-8").write("\n".join(out))
print(len(words), len(gross), len(klein))
