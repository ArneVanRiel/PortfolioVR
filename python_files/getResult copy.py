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

def get_raceresult():
    stage = Stage("race/ronde-van-vlaanderen/2024/result")
    result = stage.results()
    print(json.dumps(result))  # Converteer naar JSON en print

get_raceresult()
