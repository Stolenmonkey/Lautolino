# Schritt 1: deutsche Wortliste mit Häufigkeiten aus dem Python-Paket "wordfreq" (pip install wordfreq) nach words.tsv schreiben.
# Aufruf: python3 export_words.py > /tmp/words.tsv
import re
from wordfreq import top_n_list, word_frequency
for w in top_n_list("de", 150000):
    if re.fullmatch(r"[a-z]{1,14}", w):
        print(f"{w}\t{word_frequency(w, 'de'):.3e}")
