import requests
import os
import json
from datetime import datetime, date, timedelta, timezone

from team_info import team_info
from game_history import games, team_abbrev_id_map

# Constants
DATA_DIR = "data"

# Global variables
github_actions_run = 'GITHUB_ACTIONS' in os.environ and os.environ['GITHUB_ACTIONS'] == 'true'
github_actions_scheduled_run = github_actions_run and 'GITHUB_EVENT_NAME' in os.environ and os.environ['GITHUB_EVENT_NAME'] == 'schedule'

mrda_teams = {}
mrda_events = {}
mrda_games = []

# Methods
def get_api_game_data(startDate, status=None):
    url = "https://api.mrda.org/v1-public/sanctioning/algorithm"
    params = {
        "start-date": startDate.strftime("%m/%d/%Y"),
        "end-date": (datetime.today() + timedelta(weeks=52)).strftime("%m/%d/%Y") # Include upcoming games
    }

    if status is not None:
        params["status"] = status

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raises an error for bad responses

    data = response.json()
    payload = data.get('payload', [])
    
    if not data["success"]:
        print("API did not return successfully.")
        exit()

    return payload

def write_json_to_file(data, file_name, var_name=None, utc_timestamp_var=None):
    file_path = os.path.join(DATA_DIR, file_name)
    # Delete if exists
    if os.path.exists(file_path):
        os.remove(file_path)
    # Write with optional JS variable name and optional UTC timestamp variable
    with open( file_path , "w" ) as f:
        if utc_timestamp_var is not None:
            f.write(utc_timestamp_var + " = \"" + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ") + "\";\n")    
        if var_name is not None:
            f.write(var_name + " = ")
        json.dump( data , f) #, indent=4) pretty print

# Get 2024+ games from API
print("Begin MRDA Central API game data retrieval...")
game_data = get_api_game_data(date(2024, 1, 1))
print("Retrieved " + str(len(game_data)) + " games from >=2024 in Pending Processing or Complete status")

approved_game_data = get_api_game_data(date(2024, 1, 1), 3)
print("Retrieved " + str(len(approved_game_data)) + " games in Approved status")
game_data.extend(approved_game_data)

#waiting_for_documents_game_data = get_api_game_data(datetime.today() - timedelta(days=45), 4)
#print("Retrieved " + str(len(waiting_for_documents_game_data)) + " games from last 45 days in Waiting for Documents status")
waiting_for_documents_game_data = get_api_game_data(date(2024, 1, 1), 4)
print("Retrieved " + str(len(waiting_for_documents_game_data)) + " games in Waiting for Documents status")
game_data.extend(waiting_for_documents_game_data)

# Compare game_data to JSON file from last calculation for scheduled runs.
# Only recalculate rankings if game_data changes (manual runs always recalculate).
game_data_json_filename = "mrda_api_data.json"
if github_actions_scheduled_run:
    if os.path.exists(game_data_json_filename):
        with open( game_data_json_filename , "r" ) as f:
            file_content = f.read()
            if file_content == json.dumps(game_data):
                # game_data has not changed, exit without recalculating rankings
                print("Game data from MRDA Central API has not changed, exiting without recalculating rankings.")
                exit()

print("Initializing MRDA games list...")                
# Save game_data to JSON file for future comparison.
write_json_to_file(game_data, game_data_json_filename)
print(f"MRDA Central API game_data saved to {game_data_json_filename} for future comparison.")

# Add 2023 events and games from game_history.py to mrda_events and mrda_games
for game_day in games:
    event_id = games.index(game_day) - len(games)
    event = {
        "start_dt": datetime.strptime(game_day[0][0], "%Y-%m-%d")
    }
    if len(game_day[0]) > 5:
        event["name"] = game_day[0][5]
    mrda_events[event_id] = event

    for game in game_day:
        mrda_game = {
            "date": datetime.strptime(game[0], "%Y-%m-%d"),
            "home_team_id": team_abbrev_id_map[game[1]],
            "home_team_score": game[2],
            "away_team_id": team_abbrev_id_map[game[3]],
            "away_team_score": game[4],
            "event_id": event_id,
            "status": 7
        }

        # Add end_dt if multi-day event
        if mrda_game["date"].date() > event["start_dt"].date() and ("end_dt" not in event or mrda_game["date"] > event["end_dt"]):
            event["end_dt"] = mrda_game["date"]

        if (game[2] == 0 and game[4] == 100) or (game[2] == 100 and game[4] == 0):
            mrda_game["forfeit"] = True
            mrda_game["forfeit_team_id"] = team_abbrev_id_map[game[1]] if game[2] == 0 and game[4] == 100 else team_abbrev_id_map[game[3]]

        mrda_games.append(mrda_game)

print("Added " + str(len(mrda_games)) + " games from 2023 in game_history.py")

# Validate and add data from API to mrda_events, mrda_teams and mrda_games
for data in sorted(game_data, key=lambda x: datetime.strptime(x["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")):
    # Required fields
    if "sanctioning" not in data or data["sanctioning"] is None:
        continue
    if "event" not in data or data["event"] is None:
        continue
    if "game_datetime" not in data["event"] or data["event"]["game_datetime"] is None:
        continue
    if "home_league" not in data["event"] or data["event"]["home_league"] is None:
        continue
    if "home_league_charter" not in data["event"] or data["event"]["home_league_charter"] is None:
        continue
    if "away_league" not in data["event"] or data["event"]["away_league"] is None:
        continue
    if "away_league_charter" not in data["event"] or data["event"]["away_league_charter"] is None:
        continue
    if "forfeit" in data["event"] and data["event"]["forfeit"] == 1 and ("forfeit_league" not in data["event"] or data["event"]["forfeit_league"] is None):
        continue

    game_dt = datetime.strptime(data["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")
    
    # Scores are not required as they're used by the upcoming games predictor, 
    # but filter out Approved games without scores older than 45 days
    if "status" in data["event"] and data["event"]["status"] == "3" and game_dt < (datetime.today() - timedelta(days=45)):
        if "home_league_score" not in data["event"] or data["event"]["home_league_score"] is None:
            continue
        if "away_league_score" not in data["event"] or data["event"]["away_league_score"] is None:
            continue

    # Map API data
    home_team_id = str(data["event"]["home_league"]) + ("a" if data["event"]["home_league_charter"] == "primary" else "b")
    away_team_id = str(data["event"]["away_league"]) + ("a" if data["event"]["away_league_charter"] == "primary" else "b")

    # Add teams to mrda_teams    
    if not home_team_id in mrda_teams:
        mrda_teams[home_team_id] = {
            "name": team_info[home_team_id]["name"] if home_team_id in team_info and "name" in team_info[home_team_id] else data["event"]["home_league_name"] + (" (A)" if data["event"]["home_league_charter"] == "primary" else " (B)"),
            "region": team_info[home_team_id]["region"] if home_team_id in team_info and "region" in team_info[home_team_id] else "AM",
            "logo": data["event"]["home_league_logo"] if "home_league_logo" in data["event"] and data["event"]["home_league_logo"] is not None else team_info[home_team_id]["logo"] if "logo" in team_info[home_team_id] else None,
            "location": team_info[home_team_id]["location"] if home_team_id in team_info and "location" in team_info[home_team_id] else None
        }
    if not away_team_id in mrda_teams:
        mrda_teams[away_team_id] = {
            "name": team_info[away_team_id]["name"] if away_team_id in team_info and "name" in team_info[away_team_id] else data["event"]["away_league_name"] + (" (A)" if data["event"]["away_league_charter"] == "primary" else " (B)"),
            "region": team_info[away_team_id]["region"] if away_team_id in team_info and "region" in team_info[away_team_id] else "AM",
            "logo": data["event"]["away_league_logo"] if "away_league_logo" in data["event"] and data["event"]["away_league_logo"] is not None else team_info[away_team_id]["logo"] if "logo" in team_info[away_team_id] else None,
            "location": team_info[away_team_id]["location"] if away_team_id in team_info and "location" in team_info[away_team_id] else None
        }
        
    game = {
        "date": game_dt,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "status": data["event"]["status"]
    }

    if "forfeit" in data["event"] and data["event"]["forfeit"] == 1:
        game["forfeit"] = True
        game["forfeit_team_id"] = home_team_id if data["event"]["forfeit_league"] == data["event"]["home_league"] else away_team_id

    if "home_league_score" in data["event"] and data["event"]["home_league_score"] is not None and "away_league_score" in data["event"] and data["event"]["away_league_score"] is not None:
        game["home_team_score"] = data["event"]["home_league_score"]
        game["away_team_score"] = data["event"]["away_league_score"]

    if "sanctioning_id" in data["event"] and data["event"]["sanctioning_id"] is not None:
        game["event_id"] = data["event"]["sanctioning_id"]

        # Add event to mrda_events
        if game["event_id"] not in mrda_events:
            event = {
                "start_dt": game_dt
            }
            if "event_name" in data["sanctioning"] and data["sanctioning"]["event_name"] is not None:
                event["name"] = data["sanctioning"]["event_name"]
            mrda_events[game["event_id"]] = event
        elif game_dt.date() > mrda_events[game["event_id"]]["start_dt"].date() and ("end_dt" not in mrda_events[game["event_id"]] or game_dt > mrda_events[game["event_id"]]["end_dt"]):
            mrda_events[data["event"]["sanctioning_id"]]["end_dt"] = game_dt

    mrda_games.append(game)

# Save mrda_events JSON to JavaScript file for local web UI, format dates first
for event_id in mrda_events.keys():
    mrda_events[event_id]["start_dt"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=mrda_events[event_id]["start_dt"])
    if "end_dt" in mrda_events[event_id]:
        mrda_events[event_id]["end_dt"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=mrda_events[event_id]["end_dt"])
write_json_to_file(mrda_events, "mrda_events.js", "mrda_events")
# Save mrda_events JSON file for external use
write_json_to_file(mrda_events, "mrda_events.json")
print("MRDA events saved to mrda_events.js and mrda_events.json")

# Save mrda_teams JSON to JavaScript file for local web UI
write_json_to_file(mrda_teams, "mrda_teams.js", "mrda_teams")
# Save mrda_teams JSON file for external use
write_json_to_file(mrda_teams, "mrda_teams.json")
print("MRDA teams saved to mrda_teams.js and mrda_teams.json")    

# Feature to remove games for excludedTeams
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
#mrda_games = [game for game in mrda_games if not game["home_team_id"] in excludedTeams and not game["away_team_id"] in excludedTeams]

# Feature to get results for a specific event.
#mrda_games = [game for game in mrda_games if game["event_name"] == "2025 Mens Roller Derby Association Championships"]

# Feature to exclude new games to look at changes from game decay only.
# mrda_games = [game for game in mrda_games if game["date"] <= datetime(2025,10,8)]