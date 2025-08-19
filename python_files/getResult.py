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
from procyclingstats import Stage

def get_raceresult(race, stage):
    stage = Stage(f"race/{race}/2024/{stage}")
    result = stage.results()
    print(json.dumps(result))  # Converteer naar JSON en print

if __name__ == "__main__":
    race = sys.argv[1] if len(sys.argv) > 1 else "tour-de-france"
    stage = sys.argv[2] if len(sys.argv) > 2 else "stage-1"
    get_raceresult(race, stage)
