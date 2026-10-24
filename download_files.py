import requests
import os
from urllib.parse import urljoin

base_url = "https://moremasr-source.github.io/Yunus-playground-/"
files = [
    "js/rooms.js",
    "js/bot.js",
    "js/series.js",
    "js/games/xo.js",
    "js/games/sudoku.js",
    "js/games/color-game.js",
    "js/games/number-rush.js",
    "js/games/balloon-game.js",
    "js/games/migration.js",
    "js/games/memory-matrix.js",
    "js/games/odd-one-out.js",
    "js/games/reverse-memory.js",
    "js/games/battleship.js",
    "js/games/logical-matrix.js",
    "js/games/mastermind.js",
    "js/games/apc.js",
    "js/games/feelings.js",
    "js/games/pmi.js",
    "js/games/not-belong.js",
    "js/games/spot-diff.js"
]

for f in files:
    url = urljoin(base_url, f)
    resp = requests.get(url)
    if resp.status_code == 200:
        path = os.path.join("/root/yunus-project", f)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fw:
            fw.write(resp.text)
        print(f"Downloaded: {f}")
    else:
        print(f"Failed: {f} ({resp.status_code})")
