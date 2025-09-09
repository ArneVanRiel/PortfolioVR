# script.py
"""import json

def get_startlist(race):
    from procyclingstats import RaceStartlist
    race_startlist = RaceStartlist(f"race/{race}/2024/startlist")
    startlist = race_startlist.startlist()
    print(json.dumps(startlist))  # Converteer naar JSON en print

if __name__ == "__main__":
    race = "tour-de-france"
    get_startlist(race)"""


import sys
import json
from procyclingstats import RaceStartlist

def get_startlist(race):
    race_startlist = RaceStartlist(f"race/{race}/2024/startlist")
    startlist = race_startlist.startlist()
    print(json.dumps(startlist))  # Converteer naar JSON en print

if __name__ == "__main__":
    race = sys.argv[1] if len(sys.argv) > 1 else "tour-de-france"
    get_startlist(race)